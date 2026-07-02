// Quick local test — no WhatsApp needed.
// Simulates a message from a family member and prints the AI's reply, so you
// can check the personas and your ANTHROPIC_API_KEY before going live.
//
//   node test-reply.js "27821112222" "Hi my boy, how are the kids?"
//   node test-reply.js "Mom" "Did you eat?"           (name also works)
//
// The first argument is a phone number OR a member name; the second is the
// message text.

const { load, findMember, getHost } = require('./config');
const { buildSystemPrompt } = require('./prompt');
const { generateReply } = require('./ai');

async function main() {
    const who = process.argv[2];
    const text = process.argv[3];
    if (!who || !text) {
        console.error('Usage: node test-reply.js "<number-or-name>" "<message>"');
        process.exit(1);
    }

    const { members } = load();
    const host = getHost();

    // Accept a name as a convenience, otherwise treat as a number.
    let member = members.find(m => (m.name || '').toLowerCase() === who.toLowerCase());
    if (!member) member = findMember(who);

    if (!member) {
        console.error(`No family member matched "${who}". Names available: ${members.map(m => m.name).join(', ')}`);
        process.exit(1);
    }

    console.log(`\n--- Chatting as ${host.name || '(host)'} to ${member.name} ---`);
    console.log(`Them: ${text}\n`);

    const systemPrompt = buildSystemPrompt(host, member);
    const reply = await generateReply(systemPrompt, [{ role: 'user', content: text }]);

    console.log(`You (AI): ${reply}\n`);
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
