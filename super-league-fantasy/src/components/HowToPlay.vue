<template>
  <div class="guide-container">
    <div class="guide-header">
      <h2>📖 New Here? Start With This.</h2>
      <p>Never played fantasy football before? This page explains the sport, then walks through exactly how Super League Pro works.</p>
    </div>

    <section class="guide-section">
      <h3>⚽ What is Fantasy Football?</h3>
      <p>
        Fantasy football is a game where you act as a manager instead of a player. You pick a squad of real, currently-playing
        footballers, and when those footballers do well in their actual matches — score a goal, keep a clean sheet, make a save —
        you earn points for it. You're not predicting who wins a match; you're building a team of individual performers and
        collecting the points they earn in real life. Whoever's squad scores the most points climbs the leaderboard.
      </p>
    </section>

    <section class="guide-section">
      <h3>🏟️ Step 1 — Build Your Squad</h3>
      <p>
        Head to the <strong>Squad &amp; Market</strong> tab. You start with a virtual budget and an
        empty squad. Every player has a price — expensive players tend to be better, but you only have so much money, so
        building a squad is a balancing act between star names and value picks. Drag players between your starting XI and your
        bench on the tactical pitch; only players in your starting XI earn you points.
      </p>
    </section>

    <section class="guide-section">
      <h3>🛒 Step 2 — Buy and Sell Players (the Transfer Market)</h3>
      <p>
        The <strong>Transfers</strong> (Transfer Market) tab is a live marketplace of real players from real clubs. Search,
        filter, and buy anyone you can afford. Prices move over time based on demand, just like a real market.
      </p>
      <p>
        <strong>What if a player costs more than you have left?</strong> That's where the <em>BNPL</em> (Buy Now, Pay Later)
        overdraft comes in — a short-term credit line built into the game. If the shortfall is small enough (up to $2.0M), you
        can still buy the player immediately: your balance drops to $0 and you take a <strong>−4 point penalty</strong> instead
        of being blocked from the purchase. It's a genuine trade-off, not free money — think of it as the in-game version of a
        real BNPL consumer credit product, and use it deliberately rather than by default.
      </p>
    </section>

    <section class="guide-section">
      <h3>👑 Step 3 — Pick a Captain</h3>
      <p>
        One player in your starting XI is your captain. Whatever points your captain earns in a gameweek are
        <strong>doubled</strong>. Pick your most reliable, highest-ceiling player as captain — it's usually the single biggest
        lever on your total score each gameweek.
      </p>
    </section>

    <section class="guide-section">
      <h3>📅 Step 4 — Gameweeks and Live Scoring ("Matchday")</h3>
      <p>
        The football calendar is split into <strong>gameweeks</strong> — one round of real-world matches at a time. Once a
        gameweek's matches are underway, running a <strong>Matchday</strong> pulls in real match statistics (goals, assists,
        clean sheets, saves) for every player in your starting XI and turns them into points, right there on the Squad tab.
        Only your starting XI counts — a star player sitting on your bench earns you nothing, so make your lineup decisions
        before the gameweek locks.
      </p>
    </section>

    <section class="guide-section">
      <h3>🎁 Bonus — Gacha Packs</h3>
      <p>
        The <strong>Mở Thẻ Cầu Thủ</strong> (Gacha) tab lets you spend virtual currency on a randomised player pack — a bit of
        risk-and-reward alongside the core transfer market. Rarer, better players are drawn less often, and the odds are
        calculated entirely on the server, so they can't be seen or manipulated from the browser.
      </p>
    </section>

    <section class="guide-section">
      <h3>⚖️ Bonus — Compare Players</h3>
      <p>
        Not sure who to buy? The <strong>So Sánh Cầu Thủ</strong> (Compare) tab puts two players side-by-side on a radar chart
        across the stats that matter for their position, plus a Tactical Fit score describing how well a player suits their
        real club's playing style — useful for breaking a tie between two similarly-priced options.
      </p>
    </section>

    <section class="guide-section highlight">
      <h3>🏆 The Goal</h3>
      <p>
        Every point you earn — from your starting XI's real match performances, doubled for your captain — adds to your spot on
        the <strong>global leaderboard</strong>. There's no "winning" a single match here; it's a season-long contest of squad
        building, budget management, and weekly lineup decisions. Check the Leagues &amp; Clubs tab next to see exactly which
        real leagues and clubs you'll be drafting from.
      </p>
    </section>
  </div>
</template>

<script setup>
// Purely static onboarding content — no backend calls, no reactive state
// beyond what the template itself needs.
</script>

<style scoped>
.guide-container {
  padding: 30px;
  background: #1e272e;
  border-radius: 16px;
  border: 1px solid #2f3640;
  color: #e0e6ed;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.guide-header { text-align: center; margin-bottom: 28px; }
.guide-header h2 { color: #f7b731; font-size: 24px; margin-bottom: 8px; }
.guide-header p { color: #a4b0be; font-size: 14px; max-width: 640px; margin: 0 auto; }

.guide-section {
  background: #232b36;
  border: 1px solid #2f3640;
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 16px;
}
.guide-section h3 {
  color: #0fb9b1;
  font-size: 16px;
  margin-bottom: 8px;
}
.guide-section p {
  font-size: 14px;
  line-height: 1.7;
  color: #d1d8e0;
  margin-bottom: 8px;
}
.guide-section p:last-child { margin-bottom: 0; }
.guide-section strong { color: #fff; }
.guide-section em { color: #f7b731; font-style: normal; font-weight: 600; }

.guide-section.highlight {
  background: linear-gradient(135deg, rgba(15, 185, 177, 0.12), rgba(247, 183, 49, 0.08));
  border-color: rgba(15, 185, 177, 0.35);
}
</style>
