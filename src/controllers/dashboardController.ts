import { Request, Response } from 'express';
import { pdfQueue } from '../services/queueService';
import { docuSignClient } from '../services/circuitBreaker';
import mongoose from 'mongoose';
import { logger } from '../services/logger';

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      pdfQueue.getWaitingCount(),
      pdfQueue.getActiveCount(),
      pdfQueue.getCompletedCount(),
      pdfQueue.getFailedCount()
    ]);
    
    const batchCount = await mongoose.connection.db.collection('batches').countDocuments();
    const documentCount = await mongoose.connection.db.collection('documents').countDocuments();
    const completedDocs = await mongoose.connection.db.collection('documents').countDocuments({ status: 'completed' });
    const failedDocs = await mongoose.connection.db.collection('documents').countDocuments({ status: 'failed' });
    
    let mongodbStatus = 'down';
    try {
      await mongoose.connection.db.admin().ping();
      mongodbStatus = 'up';
    } catch (error) {
      mongodbStatus = 'down';
    }
    
    let redisStatus = 'down';
    try {
      await pdfQueue.client.ping();
      redisStatus = 'up';
    } catch (error) {
      redisStatus = 'down';
    }
    
    const cbStats = docuSignClient.getCircuitBreakerStats();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>PDF Generator - Dashboard</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: #1e1e1e;
            color: #d4d4d4;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #4ec9b0;
            border-bottom: 2px solid #4ec9b0;
            padding-bottom: 10px;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .card {
            background: #2d2d2d;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #4ec9b0;
        }
        .card h2 {
            margin-top: 0;
            color: #4ec9b0;
            font-size: 16px;
            text-transform: uppercase;
        }
        .metric {
            font-size: 32px;
            font-weight: bold;
            color: #dcdcaa;
        }
        .metric-label {
            font-size: 12px;
            color: #858585;
            margin-top: 5px;
        }
        .status-up {
            color: #4ec9b0;
        }
        .status-down {
            color: #f48771;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid #3c3c3c;
        }
        th {
            color: #4ec9b0;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 12px;
            color: #858585;
        }
        .refresh {
            background: #4ec9b0;
            color: #1e1e1e;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: monospace;
            margin-bottom: 20px;
        }
        .refresh:hover {
            background: #5fd4bb;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 PDF Generator - System Dashboard</h1>
        <button class="refresh" onclick="location.reload()">🔄 Refresh</button>
        
        <div class="dashboard">
            <div class="card">
                <h2>📈 Queue Statistics</h2>
                <div class="metric">${waiting + active}</div>
                <div class="metric-label">Total Jobs in Queue</div>
                <table>
                    <tr><td>Waiting:</td><td><strong>${waiting}</strong></td></tr>
                    <tr><td>Active:</td><td><strong>${active}</strong></td></tr>
                    <tr><td>Completed:</td><td><strong>${completed}</strong></td></tr>
                    <tr><td>Failed:</td><td><strong>${failed}</strong></td></tr>
                </table>
            </div>
            
            <div class="card">
                <h2>📄 Documents</h2>
                <div class="metric">${documentCount}</div>
                <div class="metric-label">Total Documents</div>
                <table>
                    <tr><td>Completed:</td><td><strong>${completedDocs}</strong></td></tr>
                    <tr><td>Failed:</td><td><strong>${failedDocs}</strong></td></tr>
                    <tr><td>Success Rate:</td><td><strong>${documentCount > 0 ? (completedDocs / documentCount * 100).toFixed(1) : 0}%</strong></td></tr>
                </table>
            </div>
            
            <div class="card">
                <h2>🗄️ Batches</h2>
                <div class="metric">${batchCount}</div>
                <div class="metric-label">Total Batches Created</div>
            </div>
            
            <div class="card">
                <h2>🔌 Service Status</h2>
                <table>
                    <tr><td>MongoDB:</td><td class="${mongodbStatus === 'up' ? 'status-up' : 'status-down'}"><strong>${mongodbStatus.toUpperCase()}</strong></td></tr>
                    <tr><td>Redis:</td><td class="${redisStatus === 'up' ? 'status-up' : 'status-down'}"><strong>${redisStatus.toUpperCase()}</strong></td></tr>
                    <tr><td>Circuit Breaker:</td><td><strong>${cbStats.state}</strong></td></tr>
                    <tr><td>Failures:</td><td><strong>${cbStats.failureCount}</strong></td></tr>
                </table>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <h2>⚡ Quick Actions</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="/metrics" target="_blank" style="background: #4ec9b0; color: #1e1e1e; padding: 8px 16px; text-decoration: none; border-radius: 4px;">View Prometheus Metrics</a>
                <a href="/health" target="_blank" style="background: #2d2d2d; color: #4ec9b0; padding: 8px 16px; text-decoration: none; border-radius: 4px; border: 1px solid #4ec9b0;">Health Check</a>
            </div>
        </div>
        
        <div class="footer">
            PDF Generator Service v1.0 | Auto-refresh every 10 seconds
        </div>
    </div>
    <script>
        setTimeout(() => location.reload(), 10000);
    </script>
</body>
</html>
    `;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error: any) {
    logger.error('Error generating dashboard', { error: error.message });
    res.status(500).json({ error: 'Error generating dashboard' });
  }
};