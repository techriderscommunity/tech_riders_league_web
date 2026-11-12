import assert from "node:assert/strict";
import { database, transaction } from "../src/lib/management/db.ts";
import * as service from "../src/lib/management/service.ts";
import * as ops from "../src/lib/management/operations.ts";
import { randomUUID } from "node:crypto";

// Legacy rows remain readable after migration; new mission API rejects URL submissions.
async function legacySubmission(input: { teamId: string; eventId: string; previousId?: string; url: string }) {
  await transaction(async client => {
    const previous = await client.query("SELECT id FROM submissions WHERE team_id=$1 AND event_id=$2 AND kind='challenge' AND current", [input.teamId, input.eventId]);
    if (previous.rows[0] && previous.rows[0].id !== input.previousId) throw new Error("Stale fixture submission");
    await client.query("UPDATE submissions SET current=false WHERE team_id=$1 AND event_id=$2 AND kind='challenge' AND current", [input.teamId, input.eventId]);
    await client.query("INSERT INTO submissions(id,team_id,event_id,kind,url) VALUES($1,$2,$3,'challenge',$4)", [randomUUID(), input.teamId, input.eventId, input.url]);
    await ops.invalidate(client, input.eventId);
  });
}

export async function operationsScenarios(context: {
  captain: service.User; staff: service.User; root: service.User; teamId: string;
  verified: (address: string, staff?: boolean) => Promise<service.User>;
  findToken: (address: string, marker: string) => Promise<string>;
}) {
  const { captain, staff, root, teamId, verified, findToken } = context;
  const board = await service.dashboard(captain);
  const originals = board.members.map(m => m.id);
  const substitute = await verified("substitute@example.test");
  const otherCaptain = await verified("other-captain@example.test");
  await service.createTeam(otherCaptain, { name: "Operations second team" });
  const otherId = (await service.dashboard(otherCaptain)).team.id;
  const otherPeople = [otherCaptain];
  for (let i = 0; i < 3; i++) {
    const address = `operations-member${i}@example.test`;
    await service.invite(otherCaptain, { teamId: otherId, email: address });
    const member = await verified(address);
    await service.acceptInvitation(member, { token: await findToken(address, "invitacion") });
    otherPeople.push(member);
  }
  await service.submitTeam(otherCaptain, { teamId: otherId });
  await service.review(staff, { kind: "team", id: otherId, status: "approved" });
  await assert.rejects(ops.inviteSubstitute(captain, { teamId, eventId: "negocio", originalId: originals[3], email: otherCaptain.email }));
  await ops.inviteSubstitute(captain, { teamId, eventId: "negocio", originalId: originals[3], email: substitute.email });
  const invite = await findToken(substitute.email, "invitacion");
  await assert.rejects(ops.acceptSubstitute(otherCaptain, { token: invite }));
  await ops.acceptSubstitute(substitute, { token: invite });
  await assert.rejects(ops.acceptSubstitute(substitute, { token: invite }));
  await assert.rejects(service.createTeam(substitute, { name: "Substitute cannot create" }));
  await assert.rejects(ops.operationsDashboard(otherCaptain, teamId));
  assert.equal((await ops.operationsDashboard(substitute, teamId)).views[0].worlds[0].people.length, 4);

  const mark = (person: string, eventId = "negocio", destination = teamId, present = true, atEnd = true) =>
    ops.markAttendance(staff, { teamId: destination, eventId, userId: person, luma: present, present, atEnd, reason: "Fixture manual Luma and presence check" });
  await assert.rejects(ops.markAttendance(captain, { teamId, eventId: "negocio", userId: captain.id, luma: true, present: true, atEnd: true, reason: "No staff" }));
  await assert.rejects(ops.markAttendance(staff, { teamId, eventId: "negocio", userId: captain.id, luma: false, present: true, atEnd: false, reason: "Invalid Luma" }));
  await assert.rejects(mark(originals[3]));
  await mark(originals[0]); await mark(originals[1]); await mark(substitute.id);
  assert.deepEqual(await transaction(c => ops.eligibility(c, teamId)), { worlds: 0, eligible: false });
  await mark(originals[2]);
  assert.deepEqual(await transaction(c => ops.eligibility(c, teamId)), { worlds: 1, eligible: false });
  await assert.rejects(ops.cancelSubstitute(captain, { teamId, eventId: "negocio", reason: "Already present" }));
  for (const [world, absent] of [["datos", 0], ["cloud", 1]] as const) {
    for (let i = 0; i < 4; i++) if (i !== absent) await mark(originals[i], world);
  }
  assert.deepEqual(await transaction(c => ops.eligibility(c, teamId)), { worlds: 3, eligible: true });
  await mark(originals[0], "hackathon");
  await assert.rejects(mark(otherCaptain.id, "hackathon", otherId));
  for (const person of otherPeople.slice(0, 3)) await mark(person.id, "negocio", otherId);
  for (const person of otherPeople.slice(0, 3)) await mark(person.id, "datos", otherId);
  let dashboard = await ops.operationsDashboard(staff);
  assert.equal(dashboard.views.find(v => v.team.id === teamId)?.eligibility.eligible, true);
  const preview = (id: string) => dashboard.previews.find(p => p.event.id === id)!.preview;
  assert.equal(preview("negocio").rows.find(t => t.id === teamId)?.puntos, 50);
  await mark(originals[2]);
  dashboard = await ops.operationsDashboard(staff);
  assert.equal(preview("negocio").rows.find(t => t.id === teamId)?.puntos, 50, "Repeated checks cannot duplicate points");

  await assert.rejects(ops.requestCaptain(captain, { teamId, nextId: substitute.id, reason: "Not original" }));
  const nextId = originals.find(id => id !== captain.id)!;
  await ops.requestCaptain(captain, { teamId, nextId, reason: "Fixture transfer" });
  dashboard = await ops.operationsDashboard(staff);
  const change = dashboard.changes.find(c => c.team_id === teamId && c.status === "pending")!;
  await assert.rejects(ops.reviewCaptain(captain, { id: change.id, status: "approved", reason: "No staff" }));
  await ops.reviewCaptain(staff, { id: change.id, status: "approved", reason: "Approved original" });
  assert.equal((await service.dashboard(captain)).team.is_captain, false);
  const next = (await database().query<service.User>("SELECT * FROM users WHERE id=$1", [nextId])).rows[0];
  await assert.rejects(ops.submitEvidence(next, { teamId, eventId: "negocio", kind: "photo", url: "https://example.test/photo" }));
  await service.redeem({ token: await findToken(next.email, "token"), purpose: "reset", password: "captain-activation-123" });
  assert.equal((await service.dashboard(next)).team.is_captain, true);
  await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "photo", url: "https://example.test/photo" }));
  await ops.requestCaptain(next, { teamId, nextId: captain.id, reason: "Restore fixture captain" });
  dashboard = await ops.operationsDashboard(staff);
  await ops.reviewCaptain(staff, { id: dashboard.changes.find(c => c.status === "pending")!.id, status: "approved", reason: "Return to original" });
  await service.redeem({ token: await findToken(captain.email, "token"), purpose: "reset", password: "new-test-password-123" });

  await ops.saveChallenge(staff, { eventId: "negocio", title: "Fixture challenge", instructions: "Build reproducible solution", status: "draft" });
  await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "challenge", url: "https://example.test/solution" }));
  await ops.saveChallenge(staff, { eventId: "negocio", title: "Fixture challenge", instructions: "Build reproducible solution", status: "published", version: 1, deadline: "2027-01-15T18:00:00+01:00" });
  await assert.rejects(ops.saveChallenge(staff, { eventId: "negocio", title: "Stale", instructions: "Stale", status: "published", version: 1 }));
  await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "photo", url: "javascript:alert(1)" }));
  await ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "photo", url: "https://example.test/photo" });
  await legacySubmission({ teamId, eventId: "negocio", url: "https://example.test/solution" });
  dashboard = await ops.operationsDashboard(staff);
  assert.equal(preview("negocio").rows.find(t => t.id === teamId)?.puntos, 50, "Pending evidence adds no points");
  for (const s of dashboard.submissions.filter(s => s.team_id === teamId && s.current)) {
    await ops.reviewEvidence(staff, { id: s.id, status: "approved", reason: "Requirements checked" });
  }
  dashboard = await ops.operationsDashboard(staff);
  assert.equal(preview("negocio").rows.find(t => t.id === teamId)?.puntos, 300);
  const first = dashboard.submissions.find(s => s.team_id === teamId && s.kind === "challenge" && s.current)!;
  await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "challenge", previousId: otherId, url: "https://example.test/changed" }));
  await legacySubmission({ teamId, eventId: "negocio", previousId: first.id, url: "https://example.test/revised" });
  await assert.rejects(ops.reviewEvidence(staff, { id: first.id, status: "approved", reason: "Obsolete evidence" }));
  dashboard = await ops.operationsDashboard(staff);
  const revised = dashboard.submissions.find(s => s.team_id === teamId && s.kind === "challenge" && s.current)!;
  assert.ok(new Date(revised.submitted_at) > new Date(first.submitted_at));
  assert.equal(preview("negocio").rows.find(t => t.id === teamId)?.puntos, 100);
  await ops.reviewEvidence(staff, { id: revised.id, status: "approved", reason: "Revised solution valid" });
  await legacySubmission({ teamId: otherId, eventId: "negocio", url: "https://example.test/second" });
  dashboard = await ops.operationsDashboard(staff);
  const second = dashboard.submissions.find(s => s.team_id === otherId && s.kind === "challenge" && s.current)!;
  await ops.reviewEvidence(staff, { id: second.id, status: "approved", reason: "Second valid" });
  await database().query("UPDATE submissions SET submitted_at=(SELECT submitted_at FROM submissions WHERE id=$2) WHERE id=$1", [second.id, revised.id]);
  dashboard = await ops.operationsDashboard(staff);
  assert.equal(preview("negocio").bonus.pending, true);
  await assert.rejects(ops.publishResults(staff, { scope: "negocio", fingerprint: preview("negocio").fingerprint }));
  await ops.resolveTie(staff, { scope: "bonus:negocio", fingerprint: preview("negocio").bonus.fingerprint, order: preview("negocio").bonus.rows.map(r => r.id).reverse().join(","), reason: "Staff fixture bonus tie" });
  dashboard = await ops.operationsDashboard(staff);
  assert.equal(preview("negocio").bonus.pending, false);
  assert.equal(preview("datos").pending, true);
  await assert.rejects(ops.resolveTie(staff, { scope: "datos", fingerprint: "stale", order: `${teamId},${otherId}`, reason: "Stale preview" }));
  await ops.resolveTie(staff, { scope: "datos", fingerprint: preview("datos").fingerprint, order: `${teamId},${otherId}`, reason: "Staff fixture ranking tie" });
  dashboard = await ops.operationsDashboard(staff);
  for (const id of ["negocio", "datos", "cloud"]) {
    await ops.publishResults(staff, { scope: id, fingerprint: preview(id).fingerprint });
  }
  dashboard = await ops.operationsDashboard(staff);
  assert.ok(dashboard.global);
  await ops.publishResults(staff, { scope: "global", fingerprint: dashboard.global.fingerprint });
  let published = await ops.publishedResults();
  assert.ok(published.rankings.global.length >= 2);
  for (const row of published.rankings.global) {
    assert.equal(row.puntos, ["negocio", "datos", "cloud"].reduce((sum, id) => sum + (published.rankings[id].find(t => t.id === row.id)?.puntos ?? 0), 0), "Global is the sum of published worlds");
  }
  assert.ok(!JSON.stringify(published).includes("@example.test"), "Public rankings contain no emails");
  await assert.rejects(ops.publishResults(captain, { scope: "global", fingerprint: dashboard.global.fingerprint }));
  const winner = published.rankings.global[0].id;
  await ops.award(staff, { kind: "prize", teamId: winner, description: "Confirmed fixture prize", reason: "Published podium" });
  await assert.rejects(ops.award(staff, { kind: "prize", teamId: winner, description: "Duplicate", reason: "Repeated action" }));
  await assert.rejects(ops.award(captain, { kind: "prize", teamId: winner, description: "Unauthorized", reason: "Not staff" }));
  dashboard = await ops.operationsDashboard(staff);
  await ops.award(staff, { id: dashboard.awards.find(a => a.kind === "prize")!.id, remove: true, reason: "Withdraw fixture prize" });
  await ops.reviewEvidence(staff, { id: revised.id, status: "correction", reason: "Correction after publication" });
  published = await ops.publishedResults();
  assert.equal(published.rankings.global, undefined);
  assert.equal(published.rankings.negocio, undefined);
  assert.ok(published.rankings.datos, "An unrelated world remains published");
  await ops.setEventState(staff, { eventId: "negocio", closed: true, reason: "Close fixture" });
  await assert.rejects(mark(originals[0]));
  await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "negocio", kind: "photo", url: "https://example.test/late" }));
  await ops.setEventState(staff, { eventId: "negocio", closed: false, reason: "Reopen for correction" });

  await assert.rejects(ops.award(staff, { kind: "voucher", eventId: "negocio", userId: originals[3], description: "Fixture", reason: "Absent" }));
  for (const person of [originals[0], originals[1], originals[2], substitute.id, otherCaptain.id]) {
    await ops.award(staff, { kind: "voucher", eventId: "negocio", userId: person, description: "Fundamentals fixture", reason: "Present at end / draw winner" });
  }
  await assert.rejects(ops.award(staff, { kind: "voucher", eventId: "negocio", userId: otherPeople[1].id, description: "Sixth", reason: "Over quota" }));
  await assert.rejects(mark(originals[0], "negocio", teamId, true, false));
  dashboard = await ops.operationsDashboard(staff);
  const voucher = dashboard.awards.find(a => a.user_id === originals[0])!;
  await ops.award(staff, { id: voucher.id, delivered: true, reason: "Receipt" });
  await ops.award(staff, { id: voucher.id, remove: true, reason: "Correction" });
  await mark(originals[0], "negocio", teamId, true, false);

  const replacement = await verified("force-majeure@example.test");
  await assert.rejects(ops.replaceMember(captain, { teamId: otherId, previousId: otherPeople[3].id, nextId: replacement.id, reason: "Not staff" }));
  await assert.rejects(ops.replaceMember(staff, { teamId: otherId, previousId: otherCaptain.id, nextId: replacement.id, reason: "Captain cannot leave" }));
  await ops.replaceMember(staff, { teamId: otherId, previousId: otherPeople[3].id, nextId: replacement.id, reason: "Force majeure approved" });
  dashboard = await ops.operationsDashboard(staff);
  const replacementView = dashboard.views.find(v => v.team.id === otherId)!;
  assert.equal(replacementView.originals.filter(p => p.original).length, 4);
  assert.equal(replacementView.originals.find(p => p.id === replacement.id)?.original, false);

  const secondStaff = await verified("operations-staff@example.test", true);
  await service.review(root, { kind: "staff", id: secondStaff.id, status: "approved" });
  await ops.communityState(root, { name: "Second fixture community", active: true, reason: "Official addition" });
  await ops.addStaffCommunity(root, { userId: secondStaff.id, name: "Second fixture community" });
  await assert.rejects(ops.communityState(staff, { name: "Fixture community", active: false, reason: "Not owner" }));
  await ops.communityState(root, { name: "Fixture community", active: false, reason: "Official withdrawal" });
  await assert.rejects(ops.saveChallenge(staff, { eventId: "cloud", title: "Removed", instructions: "Removed", status: "draft" }));
  assert.equal((await database().query("SELECT staff_status FROM users WHERE id=$1", [secondStaff.id])).rows[0].staff_status, "approved", "Other valid community preserves staff role");
  await assert.rejects(service.createTeam(secondStaff, { name: "Dual role fixture" }), /no pueden participar/);
  await ops.leaveStaff(secondStaff, { reason: "Personal withdrawal" });
  assert.equal((await database().query("SELECT active FROM staff_communities WHERE name='Second fixture community'")).rows[0].active, true);
  await assert.rejects(ops.operationsDashboard(secondStaff));
  await service.createTeam(secondStaff, { name: "Former staff fixture" });
  assert.ok((await service.dashboard(secondStaff)).team, "Former staff can participate after leaving staff");

  await ops.saveContribution(root, { name: "Fixture sponsor", description: "Resources", destination: "Breakfast", amountCents: 0, url: "https://example.test/resource", authorized: false });
  assert.equal((await database().query("SELECT id FROM contributions WHERE authorized")).rowCount, 0);
  await ops.requestWithdrawal(replacement, { reason: "Remove my account" });
  dashboard = await ops.operationsDashboard(root);
  const withdrawal = dashboard.withdrawals.find(w => w.user_id === replacement.id)!;
  const replacementSession = await service.login({ email: replacement.email, password: "test-password-123" });
  await ops.reviewWithdrawal(root, { id: withdrawal.id, status: "completed", reason: "Identity verified" });
  assert.equal(await service.sessionUser(replacementSession), undefined);
  await assert.rejects(service.login({ email: replacement.email, password: "test-password-123" }));
  const profile = await verified("profile@example.test");
  await assert.rejects(ops.updateProfile(profile, { firstName: "Changed", lastName: "Fixture", email: "new-profile@example.test", currentPassword: "wrong-password-123" }));
  const profileSession = await service.login({ email: profile.email, password: "test-password-123" });
  await ops.updateProfile(profile, { firstName: "Changed", lastName: "Fixture", email: "new-profile@example.test", currentPassword: "test-password-123" });
  await assert.rejects(service.login({ email: "new-profile@example.test", password: "test-password-123" }));
  await service.redeem({ token: await findToken("new-profile@example.test", "token"), purpose: "verify" });
  assert.equal(await service.sessionUser(profileSession), undefined);
  assert.ok(await service.login({ email: "new-profile@example.test", password: "test-password-123" }));
  await assert.rejects(ops.updateProfile(profile, { firstName: "Changed", lastName: "Fixture", email: captain.email, currentPassword: "test-password-123" }));
  await assert.rejects(ops.retireSeason(root));
  await assert.rejects(ops.setRetention(root, { date: "2030-01-01T00:00:00Z" }));
  assert.ok((await database().query("SELECT id FROM audit_log WHERE action='tie.resolved' AND details->>'reason' IS NOT NULL")).rowCount! >= 2);
}

export async function retentionScenario(root: service.User) {
  const before = await ops.publishedResults();
  await database().query("UPDATE seasons SET retention_at=now()-interval '1 second' WHERE id='2027'");
  await ops.retireSeason(root);
  const after = await ops.publishedResults();
  assert.ok(Object.values(after.rankings).flat().every(r => r.equipo.startsWith("Equipo histórico ")));
  assert.equal(Object.values(after.rankings).flat().length, Object.values(before.rankings).flat().length);
  assert.equal((await database().query("SELECT id FROM users WHERE NOT is_owner AND staff_status<>'approved' AND disabled_at IS NULL")).rowCount, 0);
  assert.equal((await database().query("SELECT * FROM members")).rowCount, 0);
  await assert.rejects(ops.retireSeason(root));
  assert.ok((await database().query("SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL", [root.id])).rowCount);
  await assert.rejects(service.register({ email: "after-retirement@example.test", firstName: "Fixture", lastName: "Late", password: "test-password-123", adult: true, accepted: true }));
}
