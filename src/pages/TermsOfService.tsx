import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TermsOfServicePage = () => {
  return (
    <div className="container mx-auto py-8 text-gray-300">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert max-w-none">
          <p><strong>Effective Date:</strong> August 30, 2025</p>
          <p><strong>Important:</strong> These Terms of Service (the “Terms”) form a legally binding agreement between you and the operator of this website and related services (collectively, the “Service”). By creating an account, connecting a wallet, placing a wager, or otherwise using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Service.</p>

          <h2>1. Eligibility and Jurisdictions</h2>
          <ul>
            <li><strong>Age:</strong> You must be at least 18 years old, or the minimum legal gambling age in your jurisdiction, whichever is higher. You represent and warrant that you meet this requirement.</li>
            <li><strong>Prohibited Locations:</strong> You may not use the Service where online gambling is illegal, regulated, or requires a local license we do not hold. This includes, without limitation, any jurisdictions that prohibit online gambling with cryptocurrency or otherwise. You are solely responsible for determining whether your use is legal.</li>
            <li><strong>One Account:</strong> You may maintain only one account/wallet per individual. We may close duplicate or related accounts.</li>
          </ul>

          <h2>2. Account, Wallets, KYC/AML</h2>
          <ul>
            <li><strong>Wallet Control:</strong> You are responsible for the security of your wallet, private keys, seed phrases, and devices. We do not store private keys and cannot recover them.</li>
            <li><strong>Account Integrity:</strong> You are responsible for all activity under your account or connected wallet.</li>
            <li><strong>KYC/AML:</strong> We may request identity verification (KYC) and perform anti-money laundering (AML), fraud, sanctions, or source of funds checks at any time. Failure to provide accurate and timely information may lead to restrictions, withholding, or closure of your account.</li>
            <li><strong>Sanctions:</strong> You confirm that you are not subject to any trade or economic sanctions or listed on any sanctions list.</li>
          </ul>

          <h2>3. Responsible Gaming</h2>
          <ul>
            <li><strong>Play Responsibly:</strong> Gambling involves risk. Do not gamble more than you can afford to lose. Outcomes are not guaranteed.</li>
            <li><strong>Self-Exclusion and Limits:</strong> You may request self-exclusion or deposit/wager limits by contacting support. We will use reasonable efforts to implement such requests.</li>
            <li><strong>Problem Gambling Resources:</strong> Consider seeking help from organizations like GamCare, Gamblers Anonymous, or local equivalents.</li>
          </ul>

          <h2>4. Wagers, Deposits, Payouts</h2>
          <ul>
            <li><strong>Currency:</strong> Wagers and payouts are settled in supported digital assets (e.g., SOL). Network fees may apply.</li>
            <li><strong>Confirmations:</strong> Deposits require network confirmations before crediting. We are not responsible for delays or failures caused by the blockchain network.</li>
            <li><strong>Wager Acceptance:</strong> Bets are accepted only when our systems confirm them. We may refuse or limit wagers at our discretion.</li>
            <li><strong>Payouts:</strong> Payouts are processed to the wallet you specify or your connected wallet. Blockchain transactions are irreversible; verify addresses carefully.</li>
            <li><strong>Errors:</strong> Obvious errors, mispriced odds, or technical glitches may void affected bets and transactions. We may correct account balances accordingly.</li>
          </ul>

          <h2>5. Bonuses, Promotions, Rewards</h2>
          <ul>
            <li><strong>Specific Rules:</strong> Bonuses or promotions may have additional terms (e.g., wagering requirements, expiry, game restrictions). Such terms are incorporated by reference.</li>
            <li><strong>Abuse:</strong> Bonus abuse, multi-accounting, or exploiting promotions may lead to forfeiture of bonuses, confiscation of winnings, and account closure.</li>
          </ul>

          <h2>6. Fairness and Game Integrity</h2>
          <ul>
            <li><strong>Provably Fair:</strong> Our games (e.g., Mines) use a provably fair system combining a server seed, client seed, and nonce to produce deterministic, verifiable outcomes. See the Provably Fair page for details.</li>
            <li><strong>Audits:</strong> We may review any game round for irregularities, exploits, latency abuse, manipulation, or collusion. We may void or adjust affected rounds and balances.</li>
          </ul>

          <h2>7. Prohibited Conduct</h2>
          <ul>
            <li>Use of bots, scripts, automation, scraping, or any unauthorized third-party tools.</li>
            <li>Interference with security, integrity, or availability of the Service.</li>
            <li>Fraud, chargebacks, stolen funds, or use of tainted/illicit crypto assets.</li>
            <li>Attempting to circumvent jurisdictional or KYC/AML restrictions.</li>
            <li>Harassment, abuse, or other unlawful or offensive behavior.</li>
          </ul>

          <h2>8. Intellectual Property</h2>
          <p>All content, trademarks, logos, graphics, software, and materials on the Service are owned by us or our licensors and are protected by applicable intellectual property laws. You receive a limited, non-exclusive, revocable license to access and use the Service for its intended purpose.</p>

          <h2>9. Privacy</h2>
          <p>Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and disclose information. By using the Service, you consent to those practices.</p>

          <h2>10. Suspension and Termination</h2>
          <p>We may suspend, restrict, or terminate your access to the Service at any time, with or without notice, for suspected breach of these Terms, suspected illegal activity, risk management, or by regulatory requirement. We may withhold funds where required by law or these Terms (e.g., pending KYC/AML checks or fraud review).</p>

          <h2>11. Disclaimers</h2>
          <ul>
            <li><strong>No Warranty:</strong> The Service is provided “AS IS” and “AS AVAILABLE” without warranties of any kind, whether express, implied, or statutory.</li>
            <li><strong>Network/Third Parties:</strong> We do not control blockchain networks, wallet providers, or third-party services and are not responsible for their acts or omissions.</li>
            <li><strong>Volatility:</strong> Digital assets are volatile and may lose value. You assume all risks associated with their use.</li>
          </ul>

          <h2>12. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, in no event shall we or our affiliates be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, or business interruption, arising out of or in connection with the Service or these Terms, even if advised of the possibility of such damages.</p>

          <h2>13. Indemnification</h2>
          <p>You agree to indemnify, defend, and hold harmless us and our affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to your use of the Service, your breach of these Terms, or your violation of any law or third-party right.</p>

          <h2>14. Dispute Resolution; Governing Law</h2>
          <ul>
            <li><strong>Arbitration:</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved by binding arbitration on an individual basis. You waive any right to a jury trial or to participate in a class action.</li>
            <li><strong>Venue and Law:</strong> Unless otherwise required by law, the governing law and seat/venue of arbitration will be specified by us based on our principal place of business. If you require a specific jurisdiction or seat, contact support before using the Service.</li>
          </ul>

          <h2>15. Changes to the Service and Terms</h2>
          <p>We may modify, suspend, or discontinue any part of the Service at any time. We may update these Terms from time to time. Material changes will be posted on the Site and become effective upon posting, unless otherwise stated. Your continued use after changes constitutes acceptance.</p>

          <h2>16. Dormant/Inactive Accounts</h2>
          <p>If your account remains inactive for an extended period, we may classify it as dormant. We may charge reasonable administration fees or close dormant accounts in accordance with applicable law and these Terms.</p>

          <h2>17. Contact</h2>
          <p>For questions or requests regarding these Terms, account limits, or self-exclusion, please contact Support via the in-site chat.</p>

          <hr />
          <p className="text-xs text-white/60"><strong>Legal Notice:</strong> This Service may involve gambling with cryptocurrency and is intended for adults. Laws vary by jurisdiction. Nothing herein constitutes legal advice. You are responsible for ensuring your compliance with applicable laws.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsOfServicePage; 