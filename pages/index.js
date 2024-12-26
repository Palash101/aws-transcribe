import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function Home() {
    const [socket, setSocket] = useState(null);
    const [audioContext, setAudioContext] = useState(null);
    const [audioInput, setAudioInput] = useState(null);
    const [processor, setProcessor] = useState(null);
    const [status, setStatus] = useState('Not recording');
    const [transcript, setTranscript] = useState('');
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [lastFinalIndex, setLastFinalIndex] = useState(0);

    useEffect(() => {
        const newSocket = io('/transcribe');
        setSocket(newSocket);

        newSocket.on('transcription', data => {
            console.log('Received transcription:', data);
            if (data.isFinal) {
                setCurrentTranscript(prev => prev + data.text + ' ');
                setLastFinalIndex(currentTranscript.length);
            } else {
                const partialTranscript = currentTranscript + data.text;
                setTranscript(partialTranscript);
            }
            setTranscript(currentTranscript);
        });

        newSocket.on('error', errorMessage => {
            console.error('Server error:', errorMessage);
            setTranscript(prev => prev + '\nError: ' + errorMessage);
        });

        return () => newSocket.close();
    }, [currentTranscript]);

    const startRecording = async () => {
        console.log('Start button clicked');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted');
            const newAudioContext = new AudioContext();
            const newAudioInput = newAudioContext.createMediaStreamSource(stream);
            const newProcessor = newAudioContext.createScriptProcessor(1024, 1, 1);
            newAudioInput.connect(newProcessor);
            newProcessor.connect(newAudioContext.destination);

            newProcessor.onaudioprocess = (e) => {
                const float32Array = e.inputBuffer.getChannelData(0);
                const int16Array = new Int16Array(float32Array.length);
                for (let i = 0; i < float32Array.length; i++) {
                    int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(float32Array[i] * 32768)));
                }
                console.log('Sending audio chunk to server, size:', int16Array.buffer.byteLength);
                socket.emit('audioData', int16Array.buffer);
            };

            socket.emit('startTranscription');
            console.log('startTranscription event emitted');
            setStatus('Recording');
            setAudioContext(newAudioContext);
            setAudioInput(newAudioInput);
            setProcessor(newProcessor);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            setStatus('Error: ' + error.message);
        }
    };

    const stopRecording = () => {
        console.log('Stop button clicked');
        if (audioContext && audioContext.state !== 'closed') {
            audioInput.disconnect();
            processor.disconnect();
            audioContext.close();
            socket.emit('stopTranscription');
            setStatus('Not recording');
        }
    };

    const clearTranscript = () => {
        console.log('Clear button clicked');
        setCurrentTranscript('');
        setLastFinalIndex(0);
        setTranscript('');
    };

    return (
        <div className="page-container">
            <div className="container">
                <h1>Real-time Audio Transcription</h1>
                <div className="status">
                    Status: <span id="statusText">{status}</span> <span id="statusIndicator">{status === 'Recording' ? '🔴' : '⚪'}</span>
                </div>
                <div className="button-container">
                    <button onClick={startRecording}>Start Transcription</button>
                    <button onClick={stopRecording}>Stop Transcription</button>
                    <button onClick={clearTranscript}>Clear Transcript</button>
                </div>
                <div id="transcript">{transcript}</div>
                <div className="info-section">
                    <h2>How to use:</h2>
                    <ul>
                        <li>Click "Start Transcription" to begin recording.</li>
                        <li>Speak clearly into your microphone.</li>
                        <li>Watch as your speech is transcribed in real-time.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
