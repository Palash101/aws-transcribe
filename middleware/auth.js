exports.authenticateUser = (socket, next) => {
    const token = socket.handshake.auth.token;
    const username = socket.handshake.auth.username;
    console.log(username,'is the username')
    if (token && username) {
        socket.user = { name: username }; // Set the username in the socket object
        next();
    } else {
        next(new Error('Authentication error'));
    }
};

function isValidToken(token) {
    // Implement your token validation logic here
    return true; // Placeholder
}

function decodeToken(token) {
    // Implement your token decoding logic here
    return { id: 'user123', name: 'John Doe' }; // Placeholder
}
