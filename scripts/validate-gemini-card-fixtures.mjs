import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

const fixtures = [
  {
    file: path.join(root, 'src/components/chat/fixtures/decision_maker_card.json'),
    type: 'decision_maker_card',
    requiredPaths: ['data.type', 'data.id', 'data.name', 'data.title', 'data.company', 'data.subtitle'],
  },
  {
    file: path.join(root, 'src/components/chat/fixtures/hierarchy_card.json'),
    type: 'hierarchy_card',
    requiredPaths: ['data.accountId', 'data.accountName', 'data.role', 'data.hierarchySummary'],
  },
  {
    file: path.join(root, 'src/components/chat/fixtures/protocol_card.json'),
    type: 'protocol_card',
    requiredPaths: ['data.protocolId', 'data.protocolName', 'data.stepCount', 'data.stepSummary', 'data.targetAccountId', 'data.hierarchySummary'],
  },
]

function readPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, segment) => (current != null ? current[segment] : undefined), value)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

for (const fixture of fixtures) {
  const raw = await fs.readFile(fixture.file, 'utf8')
  const parsed = JSON.parse(raw)

  assert(parsed.type === fixture.type, `${path.basename(fixture.file)}: expected type "${fixture.type}"`)

  for (const requiredPath of fixture.requiredPaths) {
    const value = readPath(parsed, requiredPath)
    assert(value != null && value !== '', `${path.basename(fixture.file)}: missing "${requiredPath}"`)
  }

  if (fixture.type === 'protocol_card') {
    assert(Array.isArray(parsed.data.stepSummary), 'protocol_card.json: stepSummary must be an array')
    assert(parsed.data.stepSummary.length > 0, 'protocol_card.json: stepSummary must not be empty')
  }

  if (fixture.type === 'decision_maker_card') {
    assert(parsed.data.type === 'contact', 'decision_maker_card.json: data.type should be "contact"')
  }
}

console.log(`Validated ${fixtures.length} Gemini card fixture(s).`)
