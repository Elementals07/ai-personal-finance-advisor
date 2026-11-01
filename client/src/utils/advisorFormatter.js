/**
 * Generic Financial Advisor Presentation Formatter
 *
 * Dynamically converts ANY Markdown text into rich, scannable,
 * executive cards, metric grids, and action items — WITHOUT any hardcoded phrases.
 */

export function renderAdvisorMarkdown(text) {
    if (!text) return '';

    // Step 1: Escape raw HTML tags (prevent XSS)
    let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Step 2: Line-by-line processing for structure
    const lines = safe.split('\n');
    const processed = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (!line) {
            processed.push('<div class="adv-spacing"></div>');
            continue;
        }

        // Horizontal dividers
        if (/^---+$/.test(line) || /^===+$/.test(line)) {
            processed.push('<div class="adv-divider"></div>');
            continue;
        }

        // Generic Key-Value Pipe Row (renders ANY 2+ piped metrics into a modern card grid)
        // e.g. "**Income:** ₹85,000 | **Spent:** ₹30,000 | **Saved:** ₹55,000"
        // or "Monthly Avg: ₹2,000 | Peak Month: ₹4,500 | Target: ₹1,500"
        if (line.includes('|') && line.includes(':')) {
            const parts = line.split('|').map(p => p.trim()).filter(Boolean);
            const isMetricRow = parts.length >= 2 && parts.every(p => {
                const clean = p.replace(/\*\*/g, '').trim();
                return clean.includes(':');
            });

            if (isMetricRow) {
                const cardsHtml = parts.map(p => {
                    const clean = p.replace(/\*\*/g, '').trim();
                    const colonIdx = clean.indexOf(':');
                    const label = clean.slice(0, colonIdx).trim();
                    const val = clean.slice(colonIdx + 1).trim();
                    return `
                    <div class="adv-kpi-card">
                        <span class="adv-kpi-label">${label}</span>
                        <span class="adv-kpi-val">${val}</span>
                    </div>`;
                }).join('');

                processed.push(`<div class="adv-kpi-grid">${cardsHtml}</div>`);
                continue;
            }
        }

        // Headers
        // Level 3 (###) — Major section or Topline callout
        if (/^###\s+/.test(line)) {
            const title = line.replace(/^###\s+/, '').replace(/\*\*/g, '');
            if (/^[🛑🚨🟢🟡💡⚡🎯📌🔍⚠️✅]/.test(title)) {
                processed.push(`<div class="adv-verdict-banner">${title}</div>`);
            } else {
                processed.push(`<h3 class="adv-h3">${title}</h3>`);
            }
            continue;
        }

        // Level 4 (####) — Sub-section title
        if (/^####\s+/.test(line)) {
            const title = line.replace(/^####\s+/, '').replace(/\*\*/g, '');
            processed.push(`<h4 class="adv-section-title">${title}</h4>`);
            continue;
        }

        // Level 2 (##) — High-level title
        if (/^##\s+/.test(line)) {
            const title = line.replace(/^##\s+/, '').replace(/\*\*/g, '');
            processed.push(`<h2 class="adv-h2">${title}</h2>`);
            continue;
        }

        // Callout boxes with leading emoji
        // Matches: 💡 Tip/Note, 🚨 Alert, ⚠️ Warning, 📌 Focus, ✅ Win/Success, 🎯 Target
        const calloutMatch = line.match(/^([💡🚨⚠️📌✅🎯])\s+(.*)$/);
        if (calloutMatch) {
            const emoji = calloutMatch[1];
            const content = calloutMatch[2];
            let type = 'tip';
            if (emoji === '🚨') type = 'danger';
            else if (emoji === '⚠️') type = 'warning';
            else if (emoji === '✅') type = 'success';
            else if (emoji === '🎯') type = 'target';

            processed.push(`
            <div class="adv-callout adv-callout-${type}">
                <span class="adv-callout-icon">${emoji}</span>
                <div class="adv-callout-body">${content}</div>
            </div>`);
            continue;
        }

        // Blockquotes (> Quote or key summary)
        if (/^&gt;\s*/.test(line) || /^>\s*/.test(line)) {
            const quoteContent = line.replace(/^(&gt;|>)\s*/, '');
            processed.push(`<div class="adv-blockquote">${quoteContent}</div>`);
            continue;
        }

        // Numbered Action Items (e.g. "1. **Cut shopping:** ...")
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
            const num = numberedMatch[1];
            const content = numberedMatch[2];
            processed.push(`
            <div class="adv-action-card">
                <span class="adv-action-badge">${num}</span>
                <div class="adv-action-content">${content}</div>
            </div>`);
            continue;
        }

        // Bullet diagnosis / breakdown items (e.g. "* 🚨 **Rent:** ..." or "* **Food:** ...")
        const bulletMatch = line.match(/^[\*\-]\s+(.*)$/);
        if (bulletMatch) {
            const content = bulletMatch[1];
            const emojiBullet = content.match(/^([🚨⚠️✅💡📌🎯])\s+(.*)$/);
            if (emojiBullet) {
                processed.push(`
                <div class="adv-diag-item">
                    <span class="adv-diag-icon">${emojiBullet[1]}</span>
                    <div class="adv-diag-content">${emojiBullet[2]}</div>
                </div>`);
            } else {
                processed.push(`
                <div class="adv-bullet-box">
                    <span class="adv-bullet-dot">•</span>
                    <div class="adv-bullet-content">${content}</div>
                </div>`);
            }
            continue;
        }

        // Normal text line
        processed.push(`<p class="adv-paragraph">${line}</p>`);
    }

    let result = processed.join('');

    // Format Bold (**text**)
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong class="adv-strong">$1</strong>');

    // Format Currency Amounts (₹12,345 or ₹12.3K) with stylish pills
    result = result.replace(/(₹[0-9,]+(?:\.[0-9]{2})?)/g, '<span class="adv-currency-pill">$1</span>');

    return result;
}
