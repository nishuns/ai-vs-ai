const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, 'assistants.dat');

const saveGameData = (assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId) => {
  const buffer = Buffer.from(`${assistant1Id}\n${vectorStore1Id}\n${assistant2Id}\n${vectorStore2Id}\n${threadId}`);
  fs.writeFileSync(FILE_PATH, buffer);
};

const loadGameData = () => {
  if (!fs.existsSync(FILE_PATH)) {
    return [null, null, null, null, null];
  }
  const buffer = fs.readFileSync(FILE_PATH);
  const [assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId] = buffer.toString().split('\n');
  return [assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId];
};

const deleteGameFile = () => {
  if (fs.existsSync(FILE_PATH)) {
    fs.unlinkSync(FILE_PATH);
  }
};

module.exports = {
  saveGameData,
  loadGameData,
  deleteGameFile
};
