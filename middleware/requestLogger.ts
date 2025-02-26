// middleware/logger.ts
import { Request, Response, NextFunction } from 'express';
import colors from 'colors';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  console.log('\n' + '─'.repeat(80).gray);
  console.log(`📥 ${req.method.green} ${req.url.blue}`);
  console.log('Headers:'.yellow, JSON.stringify(req.headers, null, 2));
  console.log('Body:'.yellow, JSON.stringify(req.body, null, 2));

  // Capture the original send function
  const oldSend = res.send;
  
  // Override the send function
  res.send = function(data): Response {
    const duration = Date.now() - start;
    
    console.log(`\n📤 Response (${duration}ms):`.green);
    console.log('Status:'.yellow, res.statusCode);
    try {
      console.log('Body:'.yellow, JSON.stringify(JSON.parse(data.toString()), null, 2));
    } catch {
      console.log('Body:'.yellow, data);
    }
    console.log('─'.repeat(80).gray + '\n');

    // Call the original send function
    return oldSend.apply(res, arguments as any);
  };

  next();
};