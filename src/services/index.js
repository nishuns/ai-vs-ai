const OpenAI = require('openai');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const openai = new OpenAI({
	apiKey: process.env.OPENAI_KEY,
});


// UPLOAD FILE:

exports.openaiUploadFile = async (streamData, purpose) => {
	// create file
	const createdFile = await openai.files.create({
		file: streamData,
		purpose: purpose,
	});

	return createdFile;
};

// create vector store

exports.createVectorStore = async (vectorConfig) => {
	const vecConfig = vectorConfig || {};
	const vectorStore = await openai.beta.vectorStores.create({
		name: `rag-store-${uuidv4()}`,
		...vecConfig,
	});

	return vectorStore;
};


// create thread

exports.createThread = async (threadConfig) => {
	const threadConf = threadConfig || {};

	const thread = await openai.beta.threads.create({
		...threadConf,
	});

	return thread;
};

// update Vector store id to thread;

exports.attachVectorStoresIntoThread = async (threadId, vectorIds) => {
	const threadVectorUpdate = await openai.beta.threads.update(threadId, {
		tool_resources: { file_search: { vector_store_ids: [...vectorIds] } },
	});

	return threadVectorUpdate;
};


exports.deleteThread = async (threadId) => {
	const response = await openai.beta.threads.del(threadId);
	return response;
};

// upload file to vector store

exports.uploadFileToVectorStore = async (storeId, fileIds) => {
	// pushing data iunto vector store
	const updatedVectorFile = await openai.beta.vectorStores.fileBatches.create(
		storeId,
		{
			file_ids: [...fileIds],
		},
	);

	return updatedVectorFile;
};

const graphAssistnat = async () => {
	const myAssistant = await openai.beta.assistants.create({
		instructions:
            'Your job is to provide optimal answer by looking in mentioned doc/data in available thread. whether its from graph data, attatched vector data, or messages so far',
		name: 'SmartGraphAssitant',
		tools: [{ type: 'file_search' }],
		model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-instruct',
	});

	console.log(myAssistant);
};

// graphAssistnat();
exports.createRunUsingThreadAndAssistantIdStream = async (threadId, assistantId, getOutputText, onEnd) => {
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