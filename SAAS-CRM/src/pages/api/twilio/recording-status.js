import recordingHandler from './recording.js';

export default async function handler(req, res) {
  return recordingHandler(req, res);
}
