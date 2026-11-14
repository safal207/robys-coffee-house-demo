// Offline planning only. Inputs are owner-supplied assumptions in kuruş, never a price or reward entitlement.
export function simulateRewards(input) {
  const required = ["paidOrders","incrementalPaidOrders","averageNetSalesMinor","averageCogsMinor","rewardNetPriceMinor","rewardCogsMinor","issuedRewards","expectedRedemptions","expectedDisplacedSales","otherProgramCostMinor","maxExposureMinor"];
  const missing = required.filter(k => input?.[k] === undefined || input[k] === null);
  if (missing.length) return {status:"missing-data",missing};
  for (const k of required) {
    if (!Number.isSafeInteger(input[k]) || input[k] < 0 || input[k] > 10000000) throw new RangeError(k);
  }
  const {paidOrders:n,incrementalPaidOrders:extra,averageNetSalesMinor:sales,averageCogsMinor:cogs,rewardNetPriceMinor:price,rewardCogsMinor:cost,issuedRewards:issued,expectedRedemptions:redeemed,expectedDisplacedSales:displaced,otherProgramCostMinor:admin,maxExposureMinor:cap}=input;
  if (n === 0 || sales === 0 || price === 0 || redeemed > issued || displaced > redeemed) throw new RangeError("invalid-count-or-price");
  // A free reward costs its COGS; if it replaces a sale, also lose the
  // contribution from that paid item. Never credit negative displacement.
  const orderContribution = sales-cogs;
  const displacedContribution = Math.max(0,price-cost);
  const baselineContribution = n*orderContribution;
  const rewardExpense = redeemed*cost+displaced*displacedContribution+admin;
  const maximumExposure = issued*(cost+displacedContribution)+admin;
  const incrementalContribution = extra*orderContribution-rewardExpense;
  const breakEvenOrders = orderContribution>0 ? Math.ceil(rewardExpense/orderContribution) : null;
  const stressBreakEvenOrders = orderContribution>0 ? Math.ceil(maximumExposure/orderContribution) : null;
  const blockers=[];
  if (orderContribution<=0) blockers.push("nonpositive-order-contribution");
  if (maximumExposure>cap) blockers.push("exposure-cap-exceeded");
  if (incrementalContribution<0) blockers.push("negative-scenario-contribution");
  return {status:blockers.length?"blocked":"planning-only",currency:"TRY",blockers,orderContributionMinor:orderContribution,baselineContributionMinor:baselineContribution,
    scenarioRewardExpenseMinor:rewardExpense,scenarioIncrementalContributionMinor:incrementalContribution,
    scenarioContributionMinor:baselineContribution+incrementalContribution,maximumExposureMinor:maximumExposure,
    zeroUpliftStressDeltaMinor:-maximumExposure,breakEvenAdditionalOrders:breakEvenOrders,stressBreakEvenAdditionalOrders:stressBreakEvenOrders};
}
