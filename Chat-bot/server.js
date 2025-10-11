const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// D-ID API configuration
const D_ID_API_KEY = process.env.D_ID_API_KEY;
const D_ID_API_URL = 'https://api.d-id.com';

// Store conversations in memory
const conversations = new Map();

const API_KEY = process.env.GOOGLE_API_KEY;

// ✅ Use one of these stable models - THEY WILL WORK!
const CURRENT_MODEL = 'gemini-2.0-flash-001'; // Stable and reliable
// Alternative: 'gemini-2.5-flash' or 'gemini-2.0-flash'

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation history
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }
    const conversationHistory = conversations.get(sessionId);

    // Prepare conversation contents
    const contents = [];

    // Add conversation history
    conversationHistory.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // API call with correct model
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CURRENT_MODEL}:generateContent`;

    console.log(`🤖 Using model: ${CURRENT_MODEL}`);

    const response = await axios.post(
      `${apiUrl}?key=${API_KEY}`,
      {
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Extract response
    if (response.data.candidates &&
      response.data.candidates[0] &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0]) {

      const aiResponse = response.data.candidates[0].content.parts[0].text;

      // Update conversation history
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: aiResponse }
      );

      // Keep only last 8 messages
      if (conversationHistory.length > 8) {
        conversations.set(sessionId, conversationHistory.slice(-8));
      }

      res.json({
        response: aiResponse,
        sessionId: sessionId,
        model: CURRENT_MODEL,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Unexpected response format from API');
    }

  } catch (error) {
    console.error('❌ API Error:', error.response?.data || error.message);

    let errorMessage = 'Failed to get AI response';

    if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a moment.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Invalid API key. Please check your Google API key.';
    } else if (error.response?.status === 404) {
      errorMessage = `Model ${CURRENT_MODEL} not found. Trying alternative...`;
      // You could implement model fallback here
    }

    res.status(500).json({
      error: errorMessage,
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Test different models
app.post('/api/test-model', async (req, res) => {
  try {
    const { modelName = 'gemini-2.0-flash-001' } = req.body;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const response = await axios.post(
      `${apiUrl}?key=${API_KEY}`,
      {
        contents: [{ role: 'user', parts: [{ text: 'Hello! Say something short.' }] }],
        generationConfig: { maxOutputTokens: 50 }
      }
    );

    const aiResponse = response.data.candidates[0].content.parts[0].text;

    res.json({
      success: true,
      model: modelName,
      response: aiResponse
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      model: req.body.modelName,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );

    const chatModels = response.data.models.filter(model =>
      model.supportedGenerationMethods?.includes('generateContent')
    ).map(model => ({
      name: model.name.split('/').pop(),
      displayName: model.displayName,
      description: model.description
    }));

    res.json({
      currentModel: CURRENT_MODEL,
      availableChatModels: chatModels,
      recommendedModels: [
        'gemini-2.0-flash-001',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-pro-latest'
      ]
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch models',
      details: error.response?.data
    });
  }
});

// Get conversation history
app.get('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = conversations.get(sessionId) || [];
  res.json({ history });
});

// Clear conversation history
app.delete('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  conversations.delete(sessionId);
  res.json({ message: 'Conversation history cleared', sessionId });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    model: CURRENT_MODEL,
    timestamp: new Date().toISOString()
  });
});

// D-ID API endpoints
app.post('/api/d-id/create-talk', async (req, res) => {
  try {
    const { text, source_url = 'presenter_1' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const response = await axios.post(
      `${D_ID_API_URL}/talks`,
      {
        script: {
          type: 'text',
          input: text
        },
        source: {
          type: 'image',
          url: source_url
        },
        config: {
          fluent: true,
          pad_audio: 0.1
        }
      },
      {
        headers: {
          'Authorization': `Basic ${D_ID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('D-ID API Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create D-ID talk',
      details: error.response?.data || error.message
    });
  }
});

// Get D-ID talk status
app.get('/api/d-id/talk/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const response = await axios.get(
      `${D_ID_API_URL}/talks/${id}`,
      {
        headers: {
          'Authorization': `Basic ${D_ID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('D-ID API Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to get D-ID talk status',
      details: error.response?.data || error.message
    });
  }
});

// ElevenLabs text-to-speech endpoint
app.post('/api/elevenlabs/tts', async (req, res) => {
  try {
    const { text, voice_id = 'EXAVITQu4vr4xnSDxMaL' } = req.body;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
      {
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );
    
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('ElevenLabs API Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate speech',
      details: error.response?.data || error.message
    });
  }
});

// Integrated AI response with TTS and D-ID
app.post('/api/ai-companion', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get or create conversation history
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }
    const conversationHistory = conversations.get(sessionId);
    
    // Prepare conversation contents for Gemini
    const contents = [];
    
    // Add conversation history
    conversationHistory.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });
    
    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });
    
    // Gemini API call
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CURRENT_MODEL}:generateContent`;
    
    const geminiResponse = await axios.post(
      `${apiUrl}?key=${API_KEY}`,
      {
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.8,
          topK: 40
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract AI response
    const aiResponse = geminiResponse.data.candidates[0].content.parts[0].text;
    
    // Update conversation history
    conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: aiResponse }
    );
    
    // Keep only last 8 messages
    if (conversationHistory.length > 8) {
      conversations.set(sessionId, conversationHistory.slice(-8));
    }
    
    // Return the AI response with session info
    res.json({
      response: aiResponse,
      sessionId: sessionId,
      model: CURRENT_MODEL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Companion API Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to get AI companion response',
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🤖 Using model: ${CURRENT_MODEL}`);
  console.log(`💬 Chat API: http://localhost:${PORT}/api/chat`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
});