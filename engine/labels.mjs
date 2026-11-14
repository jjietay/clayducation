// Plain items need a label on their front (the user asked, 2026-11-14). In the JEV video the mascot carried three
// plain boxes (a ticket, a LoRA adapter, an unsure ticket), and nothing on a box said what it was: the only names were
// in the text column. A box that stands for something gets a print on its +z face with g.print(model, part, 'name').
// This reads scenes.js as text: each scene() block that makes one of these models must also call print().

export const LABEL_ITEMS = ['parcel', 'crate'];

// Returns one message for each scene that makes a plain item and prints no label.
export function unlabeledItems(src) {
  const out = [], starts = [...src.matchAll(/scene\(\s*['"]([\w-]+)['"]/g)];
  starts.forEach((m, i) => {
    const block = src.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : src.length);
    const made = [...new Set([...block.matchAll(/\.model\(\s*['"](\w+)['"]/g)].map((x) => x[1]).filter((n) => LABEL_ITEMS.includes(n)))];
    if (made.length && !/\.print\(/.test(block)) out.push(`${m[1]}: ${made.join(', ')} with no label. Print what it stands for on its front: await g.print(model, 'box', 'ticket', { at: [...] }) (styles/clay.md, "Label plain items")`);
  });
  return out;
}
