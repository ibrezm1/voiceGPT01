<script>
	import { onMount, onDestroy } from 'svelte';
  
	let transcriptions = [];
	let diagnoses = '';
	let questions = '';
	let ws;
	let connectionStatus = 'Disconnected';
	let isRecording = false;
  
	function connectWebSocket() {
	  ws = new WebSocket('ws://localhost:8088');
  
	  ws.onopen = () => {
		connectionStatus = 'Connected';
	  };
  
	  ws.onmessage = (event) => {
		const data = JSON.parse(event.data);
		if (data.type === 'transcription') {
		  transcriptions = [...transcriptions, data.text];
		} else if (data.type === 'diagnoses') {
			// replace newline characters with <br> tags
		  diagnoses = data.text.replace(/\n/g, '<br><br>');
		} else if (data.type === 'questions') {
			questions = data.text.replace(/\n/g, '<br><br>');
		} else if (data.type === 'recordingStatus') {
		  isRecording = data.isRecording;
		}
	  };
  
	  ws.onerror = (error) => {
		console.error('WebSocket error:', error);
		connectionStatus = 'Error';
	  };
  
	  ws.onclose = () => {
		connectionStatus = 'Disconnected';
		setTimeout(connectWebSocket, 5000);  // Try to reconnect after 5 seconds
	  };
	}
  
	function toggleRecording() {
	  if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ command: isRecording ? 'stopRecording' : 'startRecording' }));
	  }
	}
  
	onMount(() => {
	  connectWebSocket();
	});
  
	onDestroy(() => {
	  if (ws) {
		ws.close();
	  }
	});
  </script>
  
  <main>
	<h1>WebSocket Gemini Responses</h1>
	<div class="status">Connection Status: {connectionStatus}</div>
	<button on:click={toggleRecording}>
	  {isRecording ? 'Stop Recording' : 'Start Recording'}
	</button>
	
	<div class="container">
	  <div class="column">
		<h2>Diagnoses</h2>
		<div class="markup-content">
		  {@html diagnoses}
		</div>
	  </div>
	  <div class="column">
		<h2>Questions</h2>
		<div class="markup-content">
		  {@html questions}
		</div>
	  </div>
	</div>
  
	<div class="transcription-container">
	  <h2>Transcriptions</h2>
	  <div class="scrollable-content transcription-content">
		{#each transcriptions as transcription}
		  <p>{transcription}</p>
		{/each}
	  </div>
	</div>
  </main>
  
  <style>
	main {
	  text-align: center;
	  padding: 1em;
	  max-width: 800px;
	  margin: 0 auto;
	  display: flex;
	  flex-direction: column;
	  height: 100vh;
	}
  
	h1 {
	  color: #ff3e00;
	  text-transform: uppercase;
	  font-size: 2em;
	  font-weight: 100;
	}
  
	.status {
	  margin-bottom: 10px;
	}
  
	button {
	  margin: 0 5px 10px;
	  padding: 10px;
	  background-color: #4CAF50;
	  color: white;
	  border: none;
	  border-radius: 5px;
	  cursor: pointer;
	}
  
	button:hover {
	  background-color: #45a049;
	}
  
	.container {
	  display: flex;
	  justify-content: space-between;
	  margin-bottom: 20px;
	}
  
	.column {
	  width: 48%;
	}
  
	.scrollable-content {
	  height: 300px;
	  overflow-y: auto;
	  border: 1px solid #ccc;
	  padding: 10px;
	  text-align: left;
	}
  
	.markup-content {
	  background-color: #f0f0f0;
	  height: 300px;
	  overflow: auto;
	}
  
	.transcription-container {
	  flex-shrink: 0;
	}
  
	.transcription-content {
	  background-color: black;
	  color: white;
	  height: 150px;
	}
  
	h2 {
	  font-size: 1.2em;
	  margin-bottom: 10px;
	}
  
	p {
	  margin: 5px 0;
	}
  </style>