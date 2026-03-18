const express = require('express');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3004'],
  credentials: true
}));
app.use(express.json());

const { requireAuth } = require('@clerk/express');

// Auth middleware
app.use('/api', requireAuth({
  onError: (error, req, res, next) => {
    console.log('Auth error:', error);
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'worknotesAI API Server is running!' });
});

// CORE API ENDPOINTS (Simplified)

// 1. Create Experience
app.post('/api/experiences', async (req, res) => {
  try {
    const { content, title } = req.body;
    
    // Find or create user
    let user = await prisma.user.findFirst({
      where: { clerkId: req.auth.userId }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: req.auth.userId,
          email: req.auth.sessionClaims?.email || 'user@example.com'
        }
      });
    }
    
    const experience = await prisma.experience.create({
      data: {
        content,
        title: title || content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        userId: user.id,
      },
    });
    
    res.json({ success: true, experience });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 2. Get All Experiences
app.get('/api/experiences', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { clerkId: req.auth.userId }
    });
    
    if (!user) {
      return res.json({ success: true, experiences: [] });
    }
    
    const experiences = await prisma.experience.findMany({
      where: { userId: user.id },
      include: {
        responses: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, experiences });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 3. Generate STAR Response
app.post('/api/experiences/:id/generate', async (req, res) => {
  try {
    const { id } = req.params;
    
    const experience = await prisma.experience.findUnique({
      where: { id }
    });
    
    if (!experience) {
      return res.json({ success: false, error: 'Experience not found' });
    }
    
    // Simple STAR generation - single AI call
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: `Convert this professional experience into a STAR format response (Situation, Task, Action, Result). 
        
        Format:
        **Situation:** [Context and background]
        **Task:** [What needed to be accomplished] 
        **Action:** [What you specifically did]
        **Result:** [Outcomes and impact]
        
        Keep it concise, specific, and impactful.`
      }, {
        role: "user",
        content: experience.content
      }]
    });
    
    const starResponse = response.choices[0].message.content;
    
    // Save the response
    const savedResponse = await prisma.response.create({
      data: {
        experienceId: id,
        starResponse,
      },
    });
    
    res.json({ success: true, response: savedResponse });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 4. Delete Experience
app.delete('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete associated responses first
    await prisma.response.deleteMany({
      where: { experienceId: id }
    });
    
    // Delete the experience
    await prisma.experience.delete({
      where: { id }
    });
    
    res.json({ success: true, message: 'Experience deleted successfully' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`worknotesAI Server running on port ${PORT}`);
});
