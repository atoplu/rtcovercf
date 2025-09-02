// Cloudflare Worker for P2P WebRTC Signaling via KV
// Deploy this to Cloudflare Workers and bind a KV namespace called "SIGNALING"

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Enable CORS for all requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route: GET /kv/{key} - Get value from KV
      if (request.method === 'GET' && url.pathname.startsWith('/kv/')) {
        const key = decodeURIComponent(url.pathname.split('/kv/')[1]);
        
        if (!key) {
          return new Response('Key required', { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        const value = await env.SIGNALING.get(key);
        
        if (value === null) {
          return new Response('Not found', { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        return new Response(value, {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Route: PUT /kv/{key} - Store value in KV
      if (request.method === 'PUT' && url.pathname.startsWith('/kv/')) {
        const key = decodeURIComponent(url.pathname.split('/kv/')[1]);
        
        if (!key) {
          return new Response('Key required', { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        const value = await request.text();
        
        // Store with TTL of 1 hour (3600 seconds)
        // This prevents old connection data from accumulating
        await env.SIGNALING.put(key, value, { expirationTtl: 3600 });

        return new Response('Stored', {
          status: 200,
          headers: corsHeaders
        });
      }

      // Route: DELETE /kv/{key} - Delete value from KV
      if (request.method === 'DELETE' && url.pathname.startsWith('/kv/')) {
        const key = decodeURIComponent(url.pathname.split('/kv/')[1]);
        
        if (!key) {
          return new Response('Key required', { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        await env.SIGNALING.delete(key);

        return new Response('Deleted', {
          status: 200,
          headers: corsHeaders
        });
      }

      // Route: GET /health - Health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          worker: 'p2p-signaling'
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Route: GET /cleanup - Clean up expired connections (optional admin endpoint)
      if (request.method === 'GET' && url.pathname === '/cleanup') {
        // In a real implementation, you might want to add authentication here
        // For now, this is a simple cleanup endpoint you can call manually
        
        const list = await env.SIGNALING.list();
        let cleaned = 0;
        
        for (const key of list.keys) {
          if (key.name.startsWith('connection_') || key.name.startsWith('ice_')) {
            const value = await env.SIGNALING.get(key.name);
            if (value) {
              try {
                const data = JSON.parse(value);
                // Clean up connections older than 1 hour
                if (data.timestamp && Date.now() - data.timestamp > 3600000) {
                  await env.SIGNALING.delete(key.name);
                  cleaned++;
                }
              } catch (e) {
                // Invalid JSON, delete anyway
                await env.SIGNALING.delete(key.name);
                cleaned++;
              }
            }
          }
        }

        return new Response(JSON.stringify({
          message: `Cleaned up ${cleaned} expired entries`
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Default route - API documentation
      if (request.method === 'GET' && url.pathname === '/') {
        return new Response(`
# P2P WebRTC Signaling API

## Endpoints:
- GET /kv/{key} - Get stored value
- PUT /kv/{key} - Store value (with 1 hour TTL)
- DELETE /kv/{key} - Delete value
- GET /health - Health check
- GET /cleanup - Clean expired entries

## Usage:
This worker facilitates WebRTC signaling by storing offers, answers, and ICE candidates in Cloudflare KV storage.

Connection keys should be shared between peers to enable P2P connection establishment.
        `, {
          headers: {
            'Content-Type': 'text/plain',
            ...corsHeaders
          }
        });
      }

      return new Response('Not Found', { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker error:', error);
      
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};
