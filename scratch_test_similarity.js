const STOP_WORDS = new Set([
  'what', 'are', 'the', 'should', 'i', 'a', 'an', 'and', 'or', 'in', 'on', 'to', 
  'of', 'for', 'with', 'is', 'was', 'it', 'take', 'can', 'you', 'my', 'do', 
  'how', 'me', 'we', 'they', 'this', 'that', 'from', 'at', 'by', 'as', 'be', 'so'
]);

function createCleanVector(text, dim = 768) {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  
  if (words.length === 0) return vec;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let hash = 0;
    for (let j = 0; j < w.length; j++) {
      hash = (hash * 31 + w.charCodeAt(j)) & 0xffffffff;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }
  return vec;
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

const docText = `Receiving (Webhook). A customer replies. The gateway forwards it instantly to our app's webhook URL. Admin calls POST /v1/sessions with a session name.`;

const vDoc = createCleanVector(docText);
const vDiet = createCleanVector('What are the protein rich diets should I take?');
const vTech = createCleanVector('How does the webhook receive messages?');

console.log('Similarity Diet (Off-topic):', dot(vDoc, vDiet));
console.log('Similarity Tech (Relevant):', dot(vDoc, vTech));
