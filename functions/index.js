const functions = require('firebase-functions');
const uuidV4 = require('uuid/v4');

var cert = require(functions.config().cloudfunctions.cert);
/// Initialize Firebase env
const admin = require('firebase-admin');
admin.initializeApp({
	credential: admin.credential.cert(cert),
  	databaseURL: functions.config().cloudfunctions.database_url
});
const database = admin.firestore();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Trigger the change of Firestore files to do the corresponding actions
exports.onCreation = functions.storage.object().onFinalize(async (object) => {
	const fileBucket = object.bucket; // The Storage bucket that contains the file.
	const filePath = object.name; // Retrieve the file path
	const contentType = object.contentType; // File content type.
	const fileName = path.basename(filePath);
	/// Only handle JSON file
	if (!contentType.endsWith('json')) {
		return
	}
	/// Download the file to a temp path
	const bucket = admin.storage().bucket(fileBucket);
	const tempFilePath = path.join(os.tmpdir(), fileName);
	const metadata = {
  		contentType: contentType,
	};
	await bucket.file(filePath).download({destination: tempFilePath});
	/// Parse the file's contents to objects called `records`, 
	/// then creating a new collection from Firestore Database
	let records = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
	/// Prefer Batch update for high performance when trying to add a list of objects
	var batch = database.batch();
	records.forEach(element => {
		let identifier = element['id'] ? element['id'] : uuidV4();
		let ref = database.collection(fileName.split('.')[0]).doc(identifier);
		batch.set(ref, element, { merge: true });
	});
	/// Discard the temp file
	fs.unlinkSync(tempFilePath);
	/// Commit a batch update
	batch.commit()
});			  

exports.onDeletion = functions.storage.object().onDelete(async (object) => {
	const contentType = object.contentType; // File content type.
	const fileName = path.basename(object.name); // Get file name from path
	/// Only handle JSON file
	if (!contentType.endsWith('json')) {
		return
	}
	/// Prefer Batch update for high performance when trying to remove a list of objects
	var batch = database.batch();
	/// Perform all available documents from a specific collection
	await database.collection(fileName.split('.')[0]).listDocuments().then(documents => {
        documents.forEach((item) => {
            batch.delete(item);
		});
		return null;
	})
	/// Commit a batch of deletion
	batch.commit()
});