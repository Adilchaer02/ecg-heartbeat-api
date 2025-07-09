const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Simple test endpoint - NO DATABASE
app.get('/api/test', (req, res) => {
    try {
        res.json({
            message: 'Simple API is working!',
            timestamp: new Date().toISOString(),
            status: 'success',
            version: '1.0.0',
            port: process.env.PORT || 'not set'
        });
    } catch (error) {
        console.error('Test endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Error in test endpoint',
            error: error.message
        });
    }
});

// Health check - NO DATABASE
app.get('/health', (req, res) => {
    try {
        res.json({
            status: 'OK',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            message: 'Server is healthy'
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'ERROR',
            message: 'Health check failed',
            error: error.message
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'ECG Heartbeat API is running!',
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
        path: req.originalUrl,
        available_endpoints: ['/', '/api/test', '/health']
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Simple ECG API running on port ${PORT}`);
    console.log(`📍 Test URL: http://localhost:${PORT}/api/test`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log(`📱 Server ready and listening on 0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});