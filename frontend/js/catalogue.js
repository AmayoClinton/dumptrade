/* ============================================================
   catalogue.js
   Renders the static "Waste catalogue" pane in browse.html.
   No backend — practical local routing guidance mapped onto the
   existing CATEGORIES where sensible.
   ============================================================ */

function renderCatalogue(container) {
  if (!container) return;

  const biodegradable = CATEGORIES.filter(c => ["organic", "textiles", "paper", "wood"].includes(c.key));
  const nonBio = CATEGORIES.filter(c => !["organic", "textiles", "paper", "wood"].includes(c.key));

  const groups = [
    {
      title: "Biodegradable vs non-biodegradable",
      body: `
        <p>Most household and workshop waste splits into two streams. Keeping them apart is what makes the rest of the routing work.</p>
        <h4>Biodegradable</h4>
        <ul>
          <li><strong>Organic</strong> (food scraps, coffee grounds, garden trimmings) &mdash; compost on site or with a black-soldier-fly unit. Avoid mixing in plastic.</li>
          <li><strong>Textiles / paper / untreated wood</strong> &mdash; can rot down or be reused. Cotton offcuts are good for patchwork or stuffing.</li>
        </ul>
        <h4>Non-biodegradable</h4>
        <ul>
          <li><strong>Plastic, e-waste, metal, batteries, construction rubble</strong> &mdash; these do not break down. They need a recycler, a scrap buyer, or a licensed handler.</li>
        </ul>
        <div class="cat-note">Rule of thumb: if it will rot, compost it; if it won't, find it a next user or a proper handler &mdash; never a fire.</div>`,
    },
    {
      title: "Upcycling alternatives",
      body: `
        <p>Before sending something for recycling, check if it has another life as-is.</p>
        <ul>
          <li><strong>Furniture</strong> &mdash; a wobbly leg or a loose screw is usually a 10-minute fix, not landfill.</li>
          <li><strong>Textiles</strong> &mdash; worn clothes become cleaning rags, quilting, or stuffing; offcuts become patchwork.</li>
          <li><strong>Construction offcuts</strong> &mdash; timber offcuts are useful for small joinery or as a firewood alternative when dry.</li>
          <li><strong>Plastic / packaging</strong> &mdash; clean PET bales go to a recycler; rigid containers can be reused for storage or planters.</li>
          <li><strong>Metal</strong> &mdash; shavings, offcuts and dead appliances have scrap value at a metal buyer.</li>
        </ul>`,
    },
    {
      title: "Hazard routing matrix",
      body: `
        <p>Some items are dangerous if burned or dumped. Route them to the right handler.</p>
        <ul>
          <li><strong>E-waste &amp; batteries</strong> &mdash; take to a licensed e-waste / battery recycler. <strong>Never burn</strong> &mdash; the fumes are toxic.</li>
          <li><strong>Industrial byproduct</strong> &mdash; confirm the material with the source; pair with a licensed processor rather than open dumping.</li>
          <li><strong>Mixed / unknown construction</strong> &mdash; separate concrete, wood and metal before disposal; coated or treated material may need a specialist.</li>
          <li><strong>Paint, solvents, oils</strong> &mdash; keep sealed and hand to a hazardous-waste point; do not pour into drains or soil.</li>
        </ul>
        <div class="cat-note">When in doubt, post it on DumpTrade with a clear description &mdash; someone nearby may have the right channel.</div>`,
    },
  ];

  container.innerHTML = groups.map((g, i) => `
    <details class="catalogue-group" ${i === 0 ? "open" : ""}>
      <summary>${g.title}</summary>
      <div class="catalogue-body">${g.body}</div>
    </details>
  `).join("");
}
