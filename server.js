const config = require('./src/config');
const db = require('./src/db');
const { createApp } = require('./src/app');
const { createMongoStore } = require('./src/store/mongoStore');
const { createMessenger } = require('./src/services/messaging');
const { createCommands } = require('./src/services/commands');
const { createSessions } = require('./src/services/sessions');

db.connect(config.mongodbUri);

const store = createMongoStore({ treasurerPhone: config.treasurerPhone });
const sessions = createSessions({ secret: config.sessionSecret });
const sendMessage = createMessenger();
const commands = createCommands(store, config);

const app = createApp({ config, store, sessions, commands, sendMessage });

app.listen(config.port, () => {
  console.log(`🚀 ${config.botName} Bot running on port ${config.port}`);
  console.log('📧 Email: sonambulosctg@gmail.com');
});

module.exports = app;
