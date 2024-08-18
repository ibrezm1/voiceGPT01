const recorder = require('node-record-lpcm16');
const speech = require('@google-cloud/speech');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const WebSocket = require('ws');
require("dotenv").config();

// Speech-to-Text client
const speechClient = new speech.SpeechClient({
  projectId: 'zeta-yen-319702',
  keyFilename: './key.json',
});

// add multiline prompt below to test Gemini
const prompt = `
You’re an expert medical consultant with extensive experience in interpreting patient-doctor conversations. Your expertise lies in identifying potential diagnoses based on symptom descriptions and medical history while also understanding the follow-up questions that would aid in clarifying the patient's condition.
Your task is to analyze a transcript between a patient and a doctor. Here is the transcript you will be working with:
Transcript: {{transcript}}
Please provide two distinct sections in your response. The first section should present the top diagnoses in reverse order of possibility, enclosed within 
$$$ 
    Possible diagnosis 1  
    Possible diagnosis 2
$$$. 
The second section should outline the next questions for the doctor to ask the patient, enclosed within 
!!! 
    question 1
    question 2
!!!.
Keep in mind that the diagnoses should reflect the nuances of the conversation and the symptoms described, while the questions should be relevant to gathering more critical information for accurate assessment.
If we do not have enough information to make a diagnosis mention not enough information in the corresponding section.
if information is not avaible mention information not available in the corresponding section.
Example response:
$$$ 
    Gastroenteritis : Viral or bacterial infection of the stomach and intestines  
    Gastritis : Inflammation of the stomach lining
$$$
!!!
    Can you describe the pain in more detail? Where exactly is the pain located? Is it sharp, burning, cramping, or dull?
    Have you had any other symptoms like nausea, vomiting, diarrhea, constipation, fever, or loss of appetite?
!!!
`


// Gemini client
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// WebSocket server
const wss = new WebSocket.Server({ port: 8088 });

const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
const languageCode = 'en-US';

const request = {
  config: {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
  },
  interimResults: false,
};

let oldText = "";
let isRecording = false;
let recognizeStream = null;
let recordStream = null;

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const chatSession = model.startChat({ generationConfig });

async function processAndSendText(text) {
  const combinedText = oldText + " " + text;
  oldText = combinedText;

  // Send the transcription to all connected WebSocket clients
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'transcription', text: text }));
    }
  });


  const updatedPrompt = prompt.replace("{{transcript}}", combinedText);

  async function extractDiagnosesAndQuestions(response) {
    const diagnosisRegex = /\$\$\$(.*?)\$\$\$/s; 
    const questionRegex = /!!!(.*?)!!!/s;

    const diagnosisMatch = response.match(diagnosisRegex);
    const questionMatch = response.match(questionRegex);

    let diagnoses = "No diagnoses found";
    let questions = "No questions found";

    if (diagnosisMatch) {
        diagnoses = diagnosisMatch[1].trim();
    }

    if (questionMatch) {
        questions = questionMatch[1].trim();
    }

    return { diagnoses, questions };
  }


  try {
    const result = await chatSession.sendMessage(updatedPrompt);
    const response = result.response.text();

    const { diagnoses, questions } = await extractDiagnosesAndQuestions(response);

    
    // Send the response to all connected WebSocket clients
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'diagnoses', text: diagnoses }));
        client.send(JSON.stringify({ type: 'questions', text: questions }));
      }
    });

    console.log("Gemini response:", response);
  } catch (error) {
    console.error("Error processing with Gemini:", error);
  }
}

let recordingStream = null;

function startRecording() {
  if (isRecording) return;

  isRecording = true;
  
  recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', console.error)
    .on('data', data => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcript = data.results[0].alternatives[0].transcript;
        console.log(`Transcription: ${transcript}`);
        processAndSendText(transcript);
      } else {
        console.log('\n\nReached transcription time limit, press Ctrl+C\n');
      }
    });

  recordingStream = recorder
    .record({
      sampleRateHertz: sampleRateHertz,
      threshold: 0,
      verbose: false,
      recordProgram: 'rec',
      silence: '10.0',
    })
    .stream()
    .on('error', console.error)
    .pipe(recognizeStream);

  console.log('Started recording');
}

function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  
  if (recordingStream) {
    recordingStream.unpipe(recognizeStream);
    // Instead of calling stop(), we'll end the stream
    recordingStream.destroy();
  }
  if (recognizeStream) {
    recognizeStream.end();
  }

  // Reset the streams
  recordingStream = null;
  recognizeStream = null;

  console.log('Stopped recording');
}
// WebSocket server connection handling
wss.on('connection', function connection(ws) {
  console.log('New WebSocket client connected');

  ws.on('message', function incoming(message) {
    const data = JSON.parse(message);
    console.log('Received:', data);

    if (data.command === 'startRecording') {
      startRecording();
    } else if (data.command === 'stopRecording') {
      stopRecording();
    }

    // Send current recording status to the client
    ws.send(JSON.stringify({ type: 'recordingStatus', isRecording }));
  });

  ws.on('close', function close() {
    console.log('WebSocket client disconnected');
  });

  // Send initial recording status to the client
  ws.send(JSON.stringify({ type: 'recordingStatus', isRecording }));
});

console.log('WebSocket server is running on port 8088');