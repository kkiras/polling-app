let ioInstance = null;

function initIO(httpServer) {
  const { Server } = require('socket.io');
  ioInstance = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  ioInstance.on('connection', (socket) => {
    // Could add rooms/namespaces if needed later
    socket.on('disconnect', () => {});
  });
  return ioInstance;
}

function getIO() {
  return ioInstance;
}

module.exports = { initIO, getIO };

