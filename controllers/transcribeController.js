const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require("@aws-sdk/client-transcribe-streaming");

const transcribeClient = new TranscribeStreamingClient({
    region: "eu-west-1",
    credentials: {
        accessKeyId: "AKIASFIXCTYKF72YU6LJ",
        secretAccessKey: "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"
    }
});

exports.handleConnection = (socket, username) => {
    console.log(`User ${username} connected`);

    let audioStream;
    let lastTranscript = '';
    let isTranscribing = false;
    let lastAudioReceivedTime = Date.now();
    let audioTimeout;

    socket.on('startTranscription', async () => {
        console.log(`User ${username} starting transcription`);
        isTranscribing = true;
        let buffer = Buffer.from('');

        audioStream = async function* () {
            while (isTranscribing) {
                const chunk = await new Promise(resolve => socket.once('audioData', resolve));
                if (chunk === null) break;
                buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
                lastAudioReceivedTime = Date.now();
                console.log('Received audio chunk, buffer size:', buffer.length);

                while (buffer.length >= 1024) {
                    yield { AudioEvent: { AudioChunk: buffer.slice(0, 1024) } };
                    buffer = buffer.slice(1024);
                }
            }
        };

        const command = new StartStreamTranscriptionCommand({
            LanguageCode: "en-US",
            MediaSampleRateHertz: 44100,
            MediaEncoding: "pcm",
            AudioStream: audioStream()
        });

        const sendCommand = async () => {
            try {
                console.log(`User ${username} sending command to AWS Transcribe`);
                const response = await transcribeClient.send(command);
                console.log(`User ${username} received response from AWS Transcribe`);
                
                for await (const event of response.TranscriptResultStream) {
                    if (!isTranscribing) break;
                    if (event.TranscriptEvent) {
                        console.log('Received TranscriptEvent:', JSON.stringify(event.TranscriptEvent));
                        const results = event.TranscriptEvent.Transcript.Results;
                        if (results.length > 0 && results[0].Alternatives.length > 0) {
                            const transcript = results[0].Alternatives[0].Transcript;
                            const isFinal = !results[0].IsPartial;

                            if (isFinal) {
                                console.log(`User ${username} emitting final transcription:`, transcript);
                                socket.to(username).emit('transcription', { text: transcript, isFinal: true });
                                lastTranscript = transcript;
                            } else {
                                const newPart = transcript.substring(lastTranscript.length);
                                if (newPart.trim() !== '') {
                                    console.log(`User ${username} emitting partial transcription:`, newPart);
                                    socket.to(username).emit('transcription', { text: newPart, isFinal: false });
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`User ${username} transcription error:`, error);
                socket.to(username).emit('error', 'Transcription error occurred: ' + error.message);
            }
        };

        audioTimeout = setInterval(() => {
            if (Date.now() - lastAudioReceivedTime > 15000) {
                console.log(`User ${username} audio timeout, stopping transcription`);
                isTranscribing = false;
                clearInterval(audioTimeout);
            }
        }, 5000);

        sendCommand();
    });

    socket.on('audioData', (data) => {
        if (isTranscribing) {
            console.log(`User ${username} received audioData event, data size:`, data.byteLength);
            socket.emit('audioData', data);
        }
    });

    socket.on('stopTranscription', () => {
        console.log(`User ${username} stopping transcription`);
        isTranscribing = false;
        audioStream = null;
        lastTranscript = '';
        clearInterval(audioTimeout);
    });

    socket.on('disconnect', () => {
        console.log(`User ${username} disconnected`);
        isTranscribing = false;
        audioStream = null;
        clearInterval(audioTimeout);
    });
};
