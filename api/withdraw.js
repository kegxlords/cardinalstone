/**
 * /api/withdraw.js
 * POST → reserve a withdrawal amount
 * GET  ?action=history&user_id=   → user history
 * GET  ?action=policy             → public policy display
 *
 * Withdrawal fees are calculated only by the admin approval endpoint.
 * The requested gross amount is reserved from the wallet at submission;
 * on approval, the admin pays gross amount minus the configured fee.
 */
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET" && req.query.action === "lock-status") {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "withdrawals_locked").single();
    return res.json({ ok: true, locked: data?.value === "true" });
  }

  if (req.method === "GET" && req.query.action === "limits") {
    const { data } = await supabase.from("site_settings").select("key,value").in("key", ["min_withdraw", "max_withdraw"]);
    const min = Number(data?.find(s => s.key === "min_withdraw")?.value || 1000);
    const max = Number(data?.find(s => s.key === "max_withdraw")?.value || 0);
    return res.json({ ok: true, min, max });
  }

  if (req.method === "GET" && req.query.action === "policy") {
    const { data } = await supabase.from("site_settings").select("key,value").in("key", [
      "require_invest_before_withdraw",
      "require_active_referral_to_withdraw",
      "withdrawal_fee_percent",
    ]);
    const policy = Object.fromEntries((data || []).map(s => [s.key, s.value]));
    return res.json({
      ok: true,
      fee_percent: Math.max(0, Number(policy.withdrawal_fee_percent || 0)),
      fee_calculated_by: "admin",
      require_invest: policy.require_invest_before_withdraw === "true",
      require_referral: policy.require_active_referral_to_withdraw === "true",
    });
  }

  const user_id = req.method === "GET" ? req.query.user_id : req.body?.user_id;
  if (!user_id) return res.status(400).json({ error: "user_id required" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("withdrawals")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, withdrawals: data || [] });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { data: lockSetting } = await supabase.from("site_settings").select("value").eq("key", "withdrawals_locked").single();
  const { data: gateSettings } = await supabase.from("site_settings").select("key,value").in("key", [
    "require_invest_before_withdraw",
    "require_active_referral_to_withdraw",
  ]);
  const gate = Object.fromEntries((gateSettings || []).map(s => [s.key, s.value]));
  if (lockSetting?.value === "true") {
    return res.json({ ok: false, error: "Withdrawals are temporarily paused. Please check back later." });
  }

  const { amount, bank_name, account_number, account_name } = req.body || {};
  if (!amount || !bank_name || !account_number || !account_name) {
    return res.status(400).json({ error: "All fields required" });
  }
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return res.status(400).json({ error: "Invalid withdrawal amount" });

  const { data: limitSettings } = await supabase.from("site_settings").select("key,value").in("key", ["min_withdraw", "max_withdraw"]);
  const minW = Number(limitSettings?.find(s => s.key === "min_withdraw")?.value || 1000);
  const maxW = Number(limitSettings?.find(s => s.key === "max_withdraw")?.value || 0);
  if (num < minW) return res.json({ ok: false, error: `Minimum withdrawal is ₦${minW.toLocaleString()}` });
  if (maxW > 0 && num > maxW) return res.json({ ok: false, error: `Maximum withdrawal is ₦${maxW.toLocaleString()}` });

  const { data: w } = await supabase.from("wallets").select("balance,total_withdrawn").eq("user_id", user_id).single();
  if (!w || Number(w.balance) < num) return res.json({ ok: false, error: "Insufficient balance" });

  const { data: profile } = await supabase.from("profiles").select("full_name,email").eq("id", user_id).single();

  if (gate.require_invest_before_withdraw === "true") {
    const { count } = await supabase.from("user_products").select("id", { count: "exact", head: true }).eq("user_id", user_id).eq("status", "active");
    if (!count) return res.json({ ok: false, error: "An active energy plan is required before withdrawal." });
  }
  if (gate.require_active_referral_to_withdraw === "true") {
    const { data: refs } = await supabase.from("profiles").select("id").eq("referred_by", user_id);
    const ids = (refs || []).map(x => x.id);
    if (!ids.length) return res.json({ ok: false, error: "An active referral is required before withdrawal." });
    const { count } = await supabase.from("user_products").select("id", { count: "exact", head: true }).in("user_id", ids).eq("status", "active");
    if (!count) return res.json({ ok: false, error: "An active referral is required before withdrawal." });
  }

  // Reserve only the amount the user requested. The fee is not charged here.
  const { error: walletError } = await supabase.from("wallets").update({
    balance: Number(w.balance) - num,
    total_withdrawn: Number(w.total_withdrawn || 0) + num,
    updated_at: new Date().toISOString(),
  }).eq("user_id", user_id);
  if (walletError) return res.status(500).json({ error: walletError.message });

  const { error: txError } = await supabase.from("wallet_transactions").insert({
    user_id,
    type: "withdrawal",
    amount: -num,
    description: "Withdrawal reserved pending admin approval",
    metadata: { fee_calculated_by: "admin_on_approval", gross_amount: num },
  });
  if (txError) return res.status(500).json({ error: txError.message });

  const { data: wit, error } = await supabase.from("withdrawals").insert({
    user_id,
    amount: num,
    bank_name,
    account_number,
    account_name,
    status: "pending",
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  try {
    const { notifyWithdrawal } = require("./telegram");
    await notifyWithdrawal({
      id: wit.id,
      amount: num,
      bank_name,
      account_number,
      account_name,
      user_name: profile?.full_name || "Unknown",
      user_email: profile?.email || "",
    });
  } catch (e) { console.warn("[withdraw] Telegram notify failed:", e.message); }

  return res.json({ ok: true, gross_amount: num, fee_calculated_by: "admin" });
};
