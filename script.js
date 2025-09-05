const apiKey = ""; 
const ttsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
const imageApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
const llmApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

// --- Utility Functions ---

function showMessage(text, isError = false) {
    const messageBox = document.getElementById('message-box');
    messageBox.textContent = text;
    messageBox.className = 'message-box block ' + (isError ? 'bg-red-500' : 'bg-emerald-600');
    setTimeout(() => {
        messageBox.className = 'message-box hidden';
    }, 3000);
}

// --- Language Switch Logic ---

const languageSelect = document.getElementById('language-select');
function setLanguage(lang) {
    document.querySelectorAll('[data-en]').forEach(el => {
        const newText = el.getAttribute(`data-${lang}`);
        if (newText) {
            el.textContent = newText;
        }
    });
}
languageSelect.addEventListener('change', (e) => setLanguage(e.target.value));
setLanguage('en');

// --- Voice Advisory Logic ---

const voiceButton = document.getElementById('voice-button');
const voiceText = document.getElementById('voice-text');
const voiceOutput = document.getElementById('voice-output');
const userTranscript = document.getElementById('user-transcript');
const llmResponseDiv = document.getElementById('llm-response');
const audioPlayer = document.getElementById('tts-audio');
const loadingSpinnerVoice = document.getElementById('loading-spinner-voice');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let langMap = {'en': 'en-US', 'hi': 'hi-IN'};

    voiceButton.addEventListener('click', () => {
        const selectedLang = languageSelect.value;
        recognition.lang = langMap[selectedLang];
        voiceText.textContent = "Listening...";
        voiceButton.disabled = true;
        recognition.start();
        voiceOutput.classList.add('hidden');
    });

    recognition.addEventListener('result', (event) => {
        const transcript = event.results[0][0].transcript;
        userTranscript.textContent = `You said: ${transcript}`;
        voiceOutput.classList.remove('hidden');
        voiceButton.disabled = false;
        voiceText.textContent = languageSelect.value === 'en' ? 'Tap to Speak' : 'बोलने के लिए टैप करें';
        fetchVoiceResponse(transcript);
    });

    recognition.addEventListener('end', () => {
        voiceButton.disabled = false;
        voiceText.textContent = languageSelect.value === 'en' ? 'Tap to Speak' : 'बोलने के लिए टैप करें';
    });
    
    recognition.addEventListener('error', (event) => {
        showMessage(`Speech recognition error: ${event.error}`, true);
        voiceButton.disabled = false;
        voiceText.textContent = languageSelect.value === 'en' ? 'Tap to Speak' : 'बोलने के लिए टैप करें';
        voiceOutput.classList.add('hidden');
    });
} else {
    showMessage("Voice recognition is not supported in this browser. Please use Chrome.", true);
    voiceButton.disabled = true;
    voiceText.textContent = "Unsupported";
}

async function fetchVoiceResponse(text) {
    loadingSpinnerVoice.classList.remove('hidden');
    llmResponseDiv.textContent = '';
    audioPlayer.classList.add('hidden');

    const textPayload = { contents: [{ parts: [{ text: text }] }] };

    try {
        // Get text response from LLM first
        const textResponse = await fetch(llmApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(textPayload)
        });
        if (!textResponse.ok) throw new Error(`HTTP error! status: ${textResponse.status}`);
        const textResult = await textResponse.json();
        const analysisText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text || "No text response found.";
        llmResponseDiv.textContent = analysisText;

        // Then, get TTS audio for the text
        const ttsPayload = {
            contents: [{ parts: [{ text: analysisText }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Iapetus" } } }
            }
        };
        const ttsResponse = await fetch(ttsApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ttsPayload)
        });
        if (!ttsResponse.ok) throw new Error(`HTTP error! status: ${ttsResponse.status}`);
        const ttsResult = await ttsResponse.json();
        const audioData = ttsResult?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        const mimeType = ttsResult?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const sampleRate = 16000;
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            audioPlayer.src = audioUrl;
            audioPlayer.classList.remove('hidden');
            audioPlayer.play();
        } else {
            showMessage("Invalid audio response format from API.", true);
        }
    } catch (error) {
        console.error("Error fetching voice response:", error);
        llmResponseDiv.textContent = languageSelect.value === 'en' ? "Sorry, I couldn't provide a response. Please try again." : "क्षमा करें, मैं कोई जवाब नहीं दे सका। कृपया पुनः प्रयास करें।";
        showMessage("Failed to get a voice response. See console for details.", true);
    } finally {
        loadingSpinnerVoice.classList.add('hidden');
    }
}

// --- PCM to WAV conversion utilities ---

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary_string.charCodeAt(i);
    return bytes.buffer;
}

function pcmToWav(pcmData, sampleRate) {
    const numChannels = 1, bitsPerSample = 16, byteRate = sampleRate * numChannels * bitsPerSample / 8, blockAlign = numChannels * bitsPerSample / 8;
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF'); view.setUint32(4, 36 + pcmData.byteLength, true); writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data'); view.setUint32(40, pcmData.byteLength, true);
    for (let i = 0; i < pcmData.length; i++) view.setInt16(44 + i * 2, pcmData[i], true);
    return new Blob([view], { type: 'audio/wav' });
}
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}

// --- Image Analysis Logic ---

const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview');
const uploadedImage = document.getElementById('uploaded-image');
const imageAnalysisResponseDiv = document.getElementById('image-analysis-response');
const loadingSpinnerImage = document.getElementById('loading-spinner-image');

imageUpload.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        uploadedImage.src = e.target.result;
        imagePreviewContainer.classList.remove('hidden');
        const base64Data = e.target.result.split(',')[1];
        await fetchImageAnalysis(base64Data, file.type);
    };
    reader.readAsDataURL(file);
});

async function fetchImageAnalysis(base64Data, mimeType) {
    loadingSpinnerImage.classList.remove('hidden');
    imageAnalysisResponseDiv.textContent = '';
    
    const prompt = languageSelect.value === 'en' ? "Analyze this image of a plant. What is its health status? If there is a disease, identify it and suggest a simple, low-cost treatment for a small-scale farmer. If the plant looks healthy, give a general tip for maintaining its health." : "इस पौधे की तस्वीर का विश्लेषण करें। इसकी स्वास्थ्य स्थिति क्या है? यदि कोई बीमारी है, तो उसकी पहचान करें और एक छोटे किसान के लिए एक सरल, कम लागत वाला उपचार सुझाएं। यदि पौधा स्वस्थ दिखता है, तो उसके स्वास्थ्य को बनाए रखने के लिए एक सामान्य सलाह दें।";
    const payload = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: base64Data } }] }] };

    try {
        const response = await fetch(imageApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        const analysisText = result?.candidates?.[0]?.content?.parts?.[0]?.text || (languageSelect.value === 'en' ? "Sorry, I couldn't analyze the image." : "क्षमा करें, मैं छवि का विश्लेषण नहीं कर सका।");
        imageAnalysisResponseDiv.textContent = analysisText;
    } catch (error) {
        console.error("Error fetching image analysis:", error);
        imageAnalysisResponseDiv.textContent = languageSelect.value === 'en' ? "Sorry, an error occurred while analyzing the image. Please try again." : "क्षमा करें, छवि का विश्लेषण करते समय एक त्रुटि हुई। कृपया पुनः प्रयास करें।";
        showMessage("Failed to analyze image. See console for details.", true);
    } finally {
        loadingSpinnerImage.classList.add('hidden');
    }
}

// --- Soil Health Logic ---

const soilForm = document.getElementById('soil-form');
const soilPhInput = document.getElementById('soil-ph');
const soilNInput = document.getElementById('soil-n');
const soilPInput = document.getElementById('soil-p');
const soilKInput = document.getElementById('soil-k');
const soilResultDiv = document.getElementById('soil-result');
const soilAnalysisText = document.getElementById('soil-analysis-text');

soilForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ph = parseFloat(soilPhInput.value);
    const n = parseInt(soilNInput.value);
    const p = parseInt(soilPInput.value);
    const k = parseInt(soilKInput.value);
    
    let recommendations = '';

    // Simple validation and recommendations
    if (isNaN(ph) || isNaN(n) || isNaN(p) || isNaN(k)) {
        recommendations = languageSelect.value === 'en' ? "Please enter valid numbers for all fields." : "कृपया सभी फ़ील्ड के लिए मान्य संख्याएं दर्ज करें।";
    } else {
        if (ph < 6.0) {
            recommendations += languageSelect.value === 'en' ? "Your soil is acidic. Consider adding agricultural lime to raise the pH.\n" : "आपकी मिट्टी अम्लीय है। pH बढ़ाने के लिए कृषि चूना डालें।\n";
        } else if (ph > 7.5) {
            recommendations += languageSelect.value === 'en' ? "Your soil is alkaline. Use organic matter like compost to lower the pH.\n" : "आपकी मिट्टी क्षारीय है। pH कम करने के लिए खाद जैसे जैविक पदार्थ का उपयोग करें।\n";
        } else {
            recommendations += languageSelect.value === 'en' ? "Your soil pH is in a good range.\n" : "आपकी मिट्टी का pH एक अच्छी सीमा में है।\n";
        }

        if (n < 200) {
            recommendations += languageSelect.value === 'en' ? "Nitrogen levels are low. Apply nitrogen-rich fertilizers like Urea.\n" : "नाइट्रोजन का स्तर कम है। यूरिया जैसे नाइट्रोजन युक्त उर्वरकों का प्रयोग करें।\n";
        }
        if (p < 40) {
            recommendations += languageSelect.value === 'en' ? "Phosphorus levels are low. Use Superphosphate to improve root development.\n" : "फास्फोरस का स्तर कम है। जड़ के विकास को बेहतर बनाने के लिए सुपरफॉस्फेट का उपयोग करें।\n";
        }
        if (k < 150) {
            recommendations += languageSelect.value === 'en' ? "Potassium levels are low. Add Muriate of Potash to improve fruit and flower production.\n" : "पोटेशियम का स्तर कम है। फल और फूल उत्पादन को बेहतर बनाने के लिए म्यूरेट ऑफ पोटाश डालें।\n";
        }
    }

    if (recommendations.trim() === '') {
        recommendations = languageSelect.value === 'en' ? "Your soil health appears good based on the data provided." : "प्रदान किए गए डेटा के आधार पर आपकी मिट्टी का स्वास्थ्य अच्छा प्रतीत होता है।";
    }

    soilAnalysisText.textContent = recommendations;
    soilResultDiv.classList.remove('hidden');
    showMessage(languageSelect.value === 'en' ? "Soil analysis complete!" : "मिट्टी का विश्लेषण पूरा हुआ!");
});


