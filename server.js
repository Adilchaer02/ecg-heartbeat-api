const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug port info
console.log('🔍 PORT DEBUG:');
console.log('process.env.PORT:', process.env.PORT);
console.log('Default fallback port: 3000');

// Simple test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'ECG Heartbeat API is working!',
        timestamp: new Date().toISOString(),
        status: 'success',
        version: '1.0.0',
        port: {
            env_port: process.env.PORT,
            listening_port: PORT
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'ECG Heartbeat API',
        status: 'running',
        endpoints: [
            'GET /api/test',
            'GET /health'
        ]
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl
    });
});

// CRITICAL: Railway port configuration
const PORT = process.env.PORT || 3000;

// IMPORTANT: Listen on 0.0.0.0 for Railway
const server = app.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error('❌ Server failed to start:', err);
        process.exit(1);
    }
    
    console.log(`🚀 ECG Heartbeat API started successfully`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Host: 0.0.0.0`);
    console.log(`✅ Server ready for connections`);
});

// Handle server errors
server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT');
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM');
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});