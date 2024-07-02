const OpenAI = require('openai');
require('dotenv').config();
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const prompts = require('./prompts');
const { saveGameData, loadGameData, deleteGameFile } = require('./utils');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

let assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId;
let topic;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const startGame = async () => {
  console.log('Welcome to AI Show!');

  // Load existing game data if it exists
  [assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId] = loadGameData();

  if (assistant1Id && vectorStore1Id && assistant2Id && vectorStore2Id) {
    rl.question('Assistants and vector stores already exist. Do you want to change them? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes') {
        await deleteAssistantsAndVectorStores();
        await createAssistantsAndVectorStores();
      }
      promptForThreadId();
    });
  } else {
    await createAssistantsAndVectorStores();
    promptForThreadId();
  }
};

const promptForThreadId = () => {
  rl.question('Do you want to create a new thread? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes') {
      await createNewThread();
    }
    askForTopic();
  });
};

const askForTopic = () => {
  rl.question('Please provide a topic for the debate: ', async (answer) => {
    topic = answer;
    console.log(`Starting debate on: ${topic}`);
    await startDebate();
  });
};

const createAssistantsAndVectorStores = async () => {
  console.log('Creating new assistants and vector stores...');

  try {
    // Create Vector Store One
    const vectorStore1 = await openai.beta.vectorStores.create({
      name: `rag-store-${uuidv4()}`,
    });
    vectorStore1Id = vectorStore1.id;
    console.log(`Created vector store for Assistant One with ID: ${vectorStore1Id}`);

    // Create Assistant One
    const assistant1 = await openai.beta.assistants.create({
      instructions: prompts.assistant1.instructions,
      name: prompts.assistant1.name,
      tools: [{ type: 'file_search' }],
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-instruct',
    });
    assistant1Id = assistant1.id;
    console.log(`Created ${prompts.assistant1.name} with ID: ${assistant1.id}`);

    // Create Vector Store Two
    const vectorStore2 = await openai.beta.vectorStores.create({
      name: `rag-store-${uuidv4()}`,
    });
    vectorStore2Id = vectorStore2.id;
    console.log(`Created vector store for Assistant Two with ID: ${vectorStore2Id}`);

    // Create Assistant Two
    const assistant2 = await openai.beta.assistants.create({
      instructions: prompts.assistant2.instructions,
      name: prompts.assistant2.name,
      tools: [{ type: 'file_search' }],
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-instruct',
    });
    assistant2Id = assistant2.id;
    console.log(`Created ${prompts.assistant2.name} with ID: ${assistant2.id}`);

    // Save game data to a file
    saveGameData(assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, null);

  } catch (err) {
    console.error('Error creating assistants and vector stores:', err);
  }
};

const createNewThread = async () => {
  console.log('Creating a new thread...');
  try {
    const thread = await openai.beta.threads.create({});
    threadId = thread.id;
    console.log(`Created thread with ID: ${threadId}`);

    // Save thread ID
    saveGameData(assistant1Id, vectorStore1Id, assistant2Id, vectorStore2Id, threadId);
  } catch (err) {
    console.error('Error creating thread:', err);
  }
};

const deleteAssistantsAndVectorStores = async () => {
  try {
    if (assistant1Id) {
      console.log(`Attempting to delete assistant with ID: ${assistant1Id}`);
      await openai.beta.assistants.del(assistant1Id);
      console.log(`Deleted assistant with ID: ${assistant1Id}`);
    }
    if (vectorStore1Id) {
      console.log(`Attempting to delete vector store with ID: ${vectorStore1Id}`);
      await openai.beta.vectorStores.del(vectorStore1Id);
      console.log(`Deleted vector store with ID: ${vectorStore1Id}`);
    }
    if (assistant2Id) {
      console.log(`Attempting to delete assistant with ID: ${assistant2Id}`);
      await openai.beta.assistants.del(assistant2Id);
      console.log(`Deleted assistant with ID: ${assistant2Id}`);
    }
    if (vectorStore2Id) {
      console.log(`Attempting to delete vector store with ID: ${vectorStore2Id}`);
      await openai.beta.vectorStores.del(vectorStore2Id);
      console.log(`Deleted vector store with ID: ${vectorStore2Id}`);
    }
    deleteGameFile();
  } catch (err) {
    console.error('Error deleting assistants and vector stores:', err);
  }
};

const askToDeleteAssistantsAndThread = () => {
  rl.question('Do you want to delete the assistants and thread? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes') {
      await deleteAssistantsAndVectorStores();
      await deleteThread();
    }
    rl.close();
    process.exit(0);
  });
};

const deleteThread = async () => {
  try {
    if (threadId) {
      console.log(`Attempting to delete thread with ID: ${threadId}`);
      await openai.beta.threads.del(threadId);
      console.log(`Deleted thread with ID: ${threadId}`);
    }
  } catch (err) {
    console.error('Error deleting thread:', err);
  }
};

const handleExit = () => {
  console.log('\nGracefully shutting down...');
  askToDeleteAssistantsAndThread();
};

process.stdin.resume();
process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

const sendMessageToThread = async (message) => {
  try {
    const response = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });
    return response;
  } catch (err) {
    console.error('Error sending message to thread:', err);
    return null;
  }
};

const createRunUsingThreadAndAssistantIdStream = async (threadId, assistantId, getOutputText, onEnd) => {
	const run = openai.beta.threads.runs
		.stream(threadId, {
			assistant_id: assistantId,
		})
		.on('textDelta', (textDelta) => {
			getOutputText(`${textDelta.value}`);
		})
		.on('end', () => {
			onEnd();
		})
		.on('error', (err) => {
			throw new Error(err.message);
		});
	return run;
};

const runWithAssistant = async (assistantId, vectorStoreId, message, assistantName) => {
  try {
    // Attach the relevant vector store to the thread
    await openai.beta.threads.update(threadId, {
      tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } },
    });

    // Send message to the thread
    await sendMessageToThread(message);

    // Run the assistant with the updated thread configuration
    return new Promise((resolve, reject) => {
      let responseText = '';
      createRunUsingThreadAndAssistantIdStream(
        threadId,
        assistantId,
        (text) => {
          responseText += text;
        },
        () => {
          console.log(`${assistantName}: ${responseText}`);
          resolve();
        }
      ).catch((err) => reject(err));
    });
  } catch (err) {
    console.error('Error running with assistant:', err);
    return null;
  }
};

const startDebate = async () => {
  let turn = 0;
  let continueDebate = true;

  while (continueDebate) {
    for (let i = 0; i < 3; i++) {
      let assistantId = turn % 2 === 0 ? assistant1Id : assistant2Id;
      let vectorStoreId = turn % 2 === 0 ? vectorStore1Id : vectorStore2Id;
      let assistantName = turn % 2 === 0 ? 'Assistant One' : 'Assistant Two';
      let message = turn === 0 ? `Debate on the topic: ${topic}. Start with merits.` : `Continue the debate on ${topic}. Always keep conversation under 50 words`;

      await runWithAssistant(assistantId, vectorStoreId, message, assistantName);
      turn++;
    }

    await new Promise((resolve) => {
      rl.question('Do you want to continue listening to the debate? (yes/no): ', (answer) => {
        if (answer.toLowerCase() !== 'yes') {
          continueDebate = false;
        }
        resolve();
      });
    });

    if (continueDebate) {
      rl.question('Do you want to create a new thread for the next round? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes') {
          await createNewThread();
        }
      });
    }
  }

  rl.close();
};

// Start the game
startGame().catch(err => {
  console.error('Error starting the game:', err);
});
