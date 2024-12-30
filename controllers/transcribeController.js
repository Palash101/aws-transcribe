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
    let bufferedAudioData = [];

    const startTranscription = async () => {
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
                const response = await transcribeClient.send(command);

                for await (const event of response.TranscriptResultStream) {
                    if (!isTranscribing) break;
                    if (event.TranscriptEvent) {
                        const results = event.TranscriptEvent.Transcript.Results;
                        if (results.length > 0 && results[0].Alternatives.length > 0) {
                            const transcript = results[0].Alternatives[0].Transcript;
                            const isFinal = !results[0].IsPartial;

                            if (isFinal) {
                                console.log(`User ${username} emitting final transcription:`, transcript);
                                socket.emit('transcription', { text: transcript, isFinal: true });
                                lastTranscript = transcript;
                            } else {
                                const newPart = transcript.substring(lastTranscript.length);
                                if (newPart.trim() !== '') {
                                    console.log(`User ${username} emitting partial transcription:`, newPart);
                                    socket.emit('transcription', { text: newPart, isFinal: false });
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                transcribeClient.destroy();

                console.error(`User ${username} transcription error:`, error);
                socket.emit('reinitate', { hasError: true });

                if (error.name === 'BadRequestException' && error.message.includes('no new audio was received for 15 seconds')) {
                    console.log(`User ${username} restarting transcription due to timeout`);
                    isTranscribing = false;
                    startTranscription();
                }
            }
        };

        sendCommand().catch((error) => {
            console.log('Send Command Error:', error);
        });
    };

    socket.on('audioData', async (data) => {
        if (!isTranscribing) {
            await startTranscription();
        }

        if (isTranscribing) {
            console.log(`User ${username} received audioData event, data size:`, data.byteLength);
            let buffer = Buffer.from(data);
            while (buffer.length >= 1024) {
                const audioChunk = buffer.slice(0, 1024);
                buffer = buffer.slice(1024);
                await audioStream().next({ AudioEvent: { AudioChunk: audioChunk } });
            }
            lastAudioReceivedTime = Date.now();
        }
    });

    socket.on('stopTranscription', () => {
        console.log(`User ${username} stopping transcription`);
        isTranscribing = false;
        audioStream = null;
        lastTranscript = '';
    });

    socket.on('disconnect', () => {
        console.log(`User ${username} disconnected`);
        isTranscribing = false;
        audioStream = null;
    });
};