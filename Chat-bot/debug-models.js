// debug-models.js
const axios = require('axios');
require('dotenv').config();

async function listModels() {
  try {
    console.log('🔍 Checking available Google Gemini models...');
    console.log('API Key:', process.env.GOOGLE_API_KEY ? '✅ Present' : '❌ Missing');
    
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY}`
    );
    
    console.log('\n📋 Available Models:');
    console.log('===================\n');
    
    // Filter models that support generateContent
    const usableModels = response.data.models.filter(model => 
      model.supportedGenerationMethods?.includes('generateContent')
    );
    
    if (usableModels.length === 0) {
      console.log('❌ No models found that support generateContent method!');
    } else {
      console.log(`✅ Found ${usableModels.length} models that support generateContent:\n`);
    }
    
    usableModels.forEach(model => {
      const shortName = model.name.split('/').pop();
      console.log(`🤖 Model: ${shortName}`);
      console.log(`   Full Name: ${model.name}`);
      console.log(`   Display: ${model.displayName}`);
      console.log(`   Description: ${model.description}`);
      console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'None'}`);
      console.log('');
    });

    // Also show all models for reference
    console.log('📖 All Models (including non-chat):');
    console.log('==================================\n');
    
    response.data.models.forEach(model => {
      const shortName = model.name.split('/').pop();
      console.log(`📝 ${shortName} - ${model.displayName}`);
    });
    
    return response.data.models;
  } catch (error) {
    console.error('❌ Error fetching models:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.error?.message || error.message);
    
    if (error.response?.status === 403) {
      console.error('\n💡 Possible solutions:');
      console.error('1. Make sure Google Generative AI API is enabled:');
      console.error('   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com');
      console.error('2. Check if your API key has proper permissions');
      console.error('3. Verify billing is set up on your Google Cloud account');
    }
    
    return null;
  }
}

listModels();