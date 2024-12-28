const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const transcribeController = require('./controllers/transcribeController');
const { authenticateUser } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Middleware to authenticate user
io.use(authenticateUser);

// Namespace for transcription
const transcribeNamespace = io.of('/transcribe');
transcribeNamespace.on('connection', (socket) => {
    const username = socket.handshake.auth.username;
    socket.join(username); // Join a private room for the user
    transcribeController.handleConnection(socket, username);
});

// You can add more namespaces here for different purposes
// const anotherNamespace = io.of('/another');
// anotherNamespace.on('connection', anotherController.handleConnection);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});