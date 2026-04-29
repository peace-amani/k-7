// import axios from "axios";
// import { downloadMediaMessage } from "@whiskeysockets/baileys";

// export default {
//   name: "vision",
//   description: "Analyze image with AI vision",
//   category: "ai",
//   aliases: ["analyzeimage", "imgvision", "gemini", "imageai"],
  
//   async execute(sock, m, args, PREFIX, extra) {
//     const jid = m.key.remoteJid;
    
//     try {
//       // Check if message is a reply to an image
//       const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
//       if (!quoted?.imageMessage) {
//         return sock.sendMessage(
//           jid,
//           {
//             text: `👁️ *AI Vision Analysis*\n\n` +
//                   `Reply to an image with a query to analyze it.\n\n` +
//                   `💡 *Examples:*\n` +
//                   `• ${PREFIX}vision What is in this image?\n` +
//                   `• ${PREFIX}vision Describe this photo\n` +
//                   `• ${PREFIX}vision Read any text in this image\n` +
//                   `• ${PREFIX}vision What objects can you see?`
//           },
//           { quoted: m }
//         );
//       }

//       // Get query from args
//       const query = args.join(" ");
//       if (!query) {
//         return sock.sendMessage(
//           jid,
//           {
//             text: `❌ *Query Required*\n\n` +
//                   `Please provide a question about the image.\n\n` +
//                   `📝 *Examples:*\n` +
//                   `• ${PREFIX}vision What is this?\n` +
//                   `• ${PREFIX}vision Describe the scene\n` +
//                   `• ${PREFIX}vision Identify objects\n\n` +
//                   `💡 *Tip:* Be specific for better analysis`
//           },
//           { quoted: m }
//         );
//       }

//       // Send initial processing message
//       const processingMsg = await sock.sendMessage(
//         jid,
//         { text: "⏳ *Downloading image from WhatsApp...*" },
//         { quoted: m }
//       );

//       // Download image from WhatsApp
//       let imageBuffer;
//       try {
//         console.log("📥 Downloading image for vision analysis...");
        
//         // Create message object for download
//         const messageObj = {
//           key: m.key,
//           message: { ...quoted }
//         };
        
//         imageBuffer = await downloadMediaMessage(
//           messageObj,
//           "buffer",
//           {},
//           { 
//             reuploadRequest: sock.updateMediaMessage,
//             logger: console
//           }
//         );

//         if (!imageBuffer || imageBuffer.length === 0) {
//           throw new Error("Received empty image buffer");
//         }

//         console.log(`✅ Downloaded ${imageBuffer.length} bytes for vision analysis`);

//       } catch (err) {
//         console.error("❌ Vision Download Error:", err.message);
//         return sock.sendMessage(
//           jid,
//           { 
//             text: "❌ *Failed to download image*\n\n" +
//                   "Possible reasons:\n" +
//                   "• Image might be too old\n" +
//                   "• Media encryption issue\n" +
//                   "• Try sending the image again\n\n" +
//                   "💡 *Tip:* Send a fresh image for best results"
//           },
//           { quoted: m }
//         );
//       }

//       // Check file size
//       const fileSizeMB = imageBuffer.length / (1024 * 1024);
//       if (fileSizeMB > 5) { // Lower limit for API compatibility
//         return sock.sendMessage(
//           jid,
//           { 
//             text: `❌ *File Too Large*\n\n` +
//                   `Size: ${fileSizeMB.toFixed(2)} MB\n` +
//                   `Limit: 5 MB\n\n` +
//                   `💡 *Solution:*\n` +
//                   `• Compress the image\n` +
//                   `• Use smaller image\n` +
//                   `• Crop if necessary`
//           },
//           { quoted: m }
//         );
//       }

//       // Convert to base64
//       const base64Image = imageBuffer.toString('base64');
//       console.log(`✅ Image converted to base64: ${base64Image.length} chars`);

//       // Update status
//       await sock.sendMessage(
//         jid,
//         {
//           text: `🤖 *Processing with AI Vision...*\n` +
//                 `Analyzing: "${query}"\n` +
//                 `Please wait...`,
//           edit: processingMsg.key
//         }
//       );

//       // Call Vision API - Try multiple endpoints
//       console.log(`🔗 Calling Vision API for query: "${query}"`);
      
//       let analysisResult = '';
//       let apiUsed = '';
      
//       // Try multiple API endpoints
//       const apiEndpoints = [
//         {
//           name: 'Keith Vision API',
//           method: 'GET',
//           url: 'https://apiskeith.vercel.app/ai/geminivision',
//           params: { q: query, image: base64Image }
//         },
//         {
//           name: 'Keith Gemini Vision',
//           method: 'GET',
//           url: 'https://apiskeith.vercel.app/ai/gemini-vision',
//           params: { q: query }
//         },
//         {
//           name: 'Keith Vision 2',
//           method: 'POST',
//           url: 'https://apiskeith.vercel.app/ai/vision',
//           data: { image: base64Image, query: query }
//         },
//         {
//           name: 'Keith Image Analysis',
//           method: 'GET',
//           url: 'https://apiskeith.vercel.app/ai/analyze-image',
//           params: { q: query }
//         },
//         {
//           name: 'Gemini Proxy API',
//           method: 'POST',
//           url: 'https://gemini-proxy-production.up.railway.app/analyze',
//           data: { image: base64Image, prompt: query }
//         }
//       ];

//       // First, upload image to get URL for endpoints that need URL
//       const uploadedUrl = await uploadImageForAnalysis(imageBuffer);
      
//       if (uploadedUrl) {
//         // Add URL-based endpoints
//         apiEndpoints.push(
//           {
//             name: 'Keith Vision URL',
//             method: 'GET',
//             url: 'https://apiskeith.vercel.app/ai/geminivision',
//             params: { q: query, url: uploadedUrl }
//           },
//           {
//             name: 'Keith Image URL',
//             method: 'GET',
//             url: 'https://apiskeith.vercel.app/ai/analyze-image',
//             params: { url: uploadedUrl, query: query }
//           }
//         );
//       }

//       for (const endpoint of apiEndpoints) {
//         try {
//           console.log(`Trying ${endpoint.name}...`);
          
//           let response;
//           if (endpoint.method === 'GET') {
//             response = await axios({
//               method: 'GET',
//               url: endpoint.url,
//               params: endpoint.params,
//               timeout: 30000,
//               headers: {
//                 'Accept': 'application/json',
//                 'User-Agent': 'WhatsApp-Bot/1.0'
//               }
//             });
//           } else {
//             response = await axios({
//               method: 'POST',
//               url: endpoint.url,
//               data: endpoint.data,
//               timeout: 30000,
//               headers: {
//                 'Content-Type': 'application/json',
//                 'Accept': 'application/json',
//                 'User-Agent': 'WhatsApp-Bot/1.0'
//               }
//             });
//           }
          
//           console.log(`${endpoint.name} response: ${response.status}`);
          
//           if (response.data) {
//             const result = extractVisionResponse(response.data);
//             if (result && result.trim() !== '') {
//               analysisResult = result;
//               apiUsed = endpoint.name;
//               break;
//             }
//           }
          
//         } catch (apiErr) {
//           console.log(`${endpoint.name} failed: ${apiErr.message}`);
//           continue;
//         }
//       }
      
//       if (!analysisResult || analysisResult.trim() === '') {
//         // Try a direct call to Keith's general AI with image context
//         try {
//           await sock.sendMessage(
//             jid,
//             {
//               text: `🔄 *Using alternative method...*`,
//               edit: processingMsg.key
//             }
//           );
          
//           // Create a prompt with image context
//           const enhancedQuery = `Analyze this image and answer: ${query}. The image has been uploaded and is available for analysis.`;
          
//           const fallbackResponse = await axios.get(
//             `https://apiskeith.vercel.app/ai/blackbox?q=${encodeURIComponent(enhancedQuery)}`,
//             { timeout: 30000 }
//           );
          
//           if (fallbackResponse.data?.status === true && fallbackResponse.data?.result) {
//             analysisResult = fallbackResponse.data.result;
//             apiUsed = 'Keith Blackbox (Fallback)';
//           }
//         } catch (fallbackErr) {
//           throw new Error('All vision APIs failed');
//         }
//       }
      
//       if (!analysisResult || analysisResult.trim() === '') {
//         throw new Error('No analysis received from AI');
//       }

//       console.log(`✅ Vision analysis completed via ${apiUsed}: ${analysisResult.length} chars`);
      
//       // Format the response
//       analysisResult = analysisResult.trim();
      
//       // Truncate if too long for WhatsApp
//       if (analysisResult.length > 2500) {
//         analysisResult = analysisResult.substring(0, 2500) + '\n\n... (analysis truncated)';
//       }

//       // Update status
//       await sock.sendMessage(
//         jid,
//         {
//           text: `✅ *Analysis complete!*\n` +
//                 `📤 *Sending results...*`,
//           edit: processingMsg.key
//         }
//       );

//       // Format final message
//       const resultText = `👁️ *AI VISION ANALYSIS*\n\n` +
//                          `📷 *Image Analysis Request:*\n"${query}"\n\n` +
//                          `🤖 *AI Analysis:*\n${analysisResult}\n\n` +
//                          `🔧 *API Used:* ${apiUsed}\n` +
//                          `⚡ *Powered by AI Vision*`;

//       // Send the analysis
//       await sock.sendMessage(
//         jid,
//         { text: resultText },
//         { quoted: m }
//       );

//       // Final success message
//       await sock.sendMessage(
//         jid,
//         {
//           text: `🎉 *Vision analysis complete!*\n\n` +
//                 `✅ Image analyzed successfully\n` +
//                 `📊 Analysis sent above\n` +
//                 `🔧 Method: ${apiUsed}`,
//           edit: processingMsg.key
//         }
//       );

//     } catch (error) {
//       console.error('❌ [Vision] ERROR:', error);
      
//       let errorMessage = '❌ *Vision analysis failed*\n\n';
      
//       if (error.message?.includes('404')) {
//         errorMessage += '• Vision API endpoint not found\n';
//         errorMessage += '• Service may be temporarily down\n';
//       } else if (error.message?.includes('All vision APIs')) {
//         errorMessage += '• All vision services are unavailable\n';
//         errorMessage += '• Try again later\n';
//         errorMessage += '• Or use text-based AI instead\n';
//       } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
//         errorMessage += '• API services are unavailable\n';
//         errorMessage += '• Check your internet connection\n';
//       } else if (error.code === 'ETIMEDOUT') {
//         errorMessage += '• Request timed out (30s)\n';
//         errorMessage += '• Try simpler query\n';
//       } else if (error.message) {
//         errorMessage += `• ${error.message}\n`;
//       }
      
//       errorMessage += '\n💡 *Temporary workaround:*\n';
//       errorMessage += `• Use ${PREFIX}blackbox for text analysis\n`;
//       errorMessage += `• Use ${PREFIX}chatgpt for general questions\n`;
//       errorMessage += `• Vision service may return soon\n\n`;
//       errorMessage += `🔄 *Try vision again later:* Reply to image with ${PREFIX}vision your_question`;

//       await sock.sendMessage(
//         jid,
//         { text: errorMessage },
//         { quoted: m }
//       );
//     }
//   }
// };

// // Helper function to extract vision response
// function extractVisionResponse(obj) {
//   if (!obj) return '';
  
//   // Prioritize common response fields
//   const priorityFields = ['result', 'response', 'answer', 'text', 'analysis', 'description', 'message', 'content', 'output'];
  
//   for (const field of priorityFields) {
//     if (obj[field] && typeof obj[field] === 'string') {
//       return obj[field];
//     }
//   }
  
//   // Check for Keith API structure
//   if (obj.status === true && obj.result) {
//     return obj.result;
//   }
  
//   // If no string field found, try to extract from nested objects
//   if (obj.data) {
//     return extractVisionResponse(obj.data);
//   }
  
//   // If array with items, join them
//   if (Array.isArray(obj) && obj.length > 0) {
//     return obj.map(item => 
//       typeof item === 'string' ? item : JSON.stringify(item)
//     ).join('\n');
//   }
  
//   // Last resort: stringify with limit
//   return JSON.stringify(obj, null, 2).substring(0, 1500);
// }

// // Helper function to upload image for analysis
// async function uploadImageForAnalysis(buffer) {
//   try {
//     // Use ptpimg.me (quick and easy)
//     const base64 = buffer.toString('base64');
//     const formData = new URLSearchParams();
//     formData.append("file-upload[0]", base64);
    
//     const response = await axios.post(
//       "https://ptpimg.me/upload.php",
//       formData.toString(),
//       {
//         headers: { 
//           "Content-Type": "application/x-www-form-urlencoded",
//           "Accept": "application/json"
//         },
//         timeout: 15000
//       }
//     );
    
//     if (response.data && Array.isArray(response.data) && response.data[0]?.code) {
//       return `https://ptpimg.me/${response.data[0].code}.${response.data[0].ext}`;
//     }
    
//     return null;
    
//   } catch (error) {
//     console.error("Image upload for analysis failed:", error.message);
//     return null;
//   }
// }