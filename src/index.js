import { obfuscate } from './obfuscator.js';
import html from './ui.html';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Serve UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }
    
    // Handle obfuscation API
    if (url.pathname === '/api/obfuscate' && request.method === 'POST') {
      try {
        const { source, options, iterations } = await request.json();
        
        if (!source || typeof source !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid source' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        let result = source;
        const iterCount = parseInt(iterations) || 1;
        
        for (let i = 0; i < iterCount; i++) {
          result = obfuscate(result, options || {});
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          result,
          originalSize: source.length,
          obfuscatedSize: result.length,
          ratio: (result.length / source.length).toFixed(2),
          iterations: iterCount
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
