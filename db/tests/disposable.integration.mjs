/** MANUAL ONLY. Never imported by tests, app, build, or Netlify functions.
 * Requires explicit authorization for both disposable DB and isolated cluster (roles are global).
 * Applies quarantined candidates ONLY after all gates pass. No default Netlify connection fallback.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { authorizeDisposable } from './disposable-gate.mjs';

async function main() {
  const target = process.env.HOURVIA_DISPOSABLE_DATABASE_URL;
  const databaseName = authorizeDisposable(target, process.argv.slice(2), process.env.NETLIFY_DB_DRIVER);
  const { getDatabase } = await import('@netlify/database');
  const db = getDatabase({ connectionString: target });
  assert.equal(db.driver, 'server');
  db.pool.options.connectionTimeoutMillis = 5000;
  db.pool.options.statement_timeout = 10000;
  const admin = await db.pool.connect();
  let checks = 0;
  const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const query = (text, params) => admin.query(text, params);
  async function begin(client = admin) {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SET LOCAL ROLE hourvia_migration');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
  }
  async function commit(client = admin) { assert.equal((await client.query('COMMIT')).command, 'COMMIT'); }
  async function denied(sql, params, codes = ['42501','23514','23503','23505']) {
    await assert.rejects(() => query(sql, params), e => codes.includes(e.code)); checks++;
  }
  async function rollbackCase(work) {
    await begin(); try { await work(); } finally { await query('ROLLBACK'); }
  }
  async function runtime(work, actor = 1, session = 21, tenant = 101) {
    // SESSION AUTHORIZATION exercises SET ROLE privileges of the restricted role.
    await query('SET SESSION AUTHORIZATION hourvia_runtime');
    await query('BEGIN');
    try {
      if (actor !== null) await query("SELECT set_config('hourvia.actor_id',$1,true),set_config('hourvia.session_id',$2,true),set_config('hourvia.organization_id',$3,true)", [uid(actor),uid(session),uid(tenant)]);
      await work();
    } finally { await query('ROLLBACK'); await query('RESET SESSION AUTHORIZATION'); }
  }
  try {
    const meta = (await query("SELECT current_database() AS name, current_setting('server_version_num')::integer AS version")).rows[0];
    assert.equal(meta.name, databaseName); assert.ok(meta.version >= 150000);
    assert.equal((await query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM pg_roles WHERE rolname IN ('hourvia_migration','hourvia_runtime')")).rowCount, 0);
    // An empty public schema alone does not establish freshness. Reject user schemas,
    // routines, extra extensions and other sessions before any candidate is applied.
    assert.equal((await query("SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')")).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql'")).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rowCount, 0);
    assert.equal((await query("SELECT rolsuper FROM pg_roles WHERE rolname=session_user")).rows[0].rolsuper, true);
    assert.equal((await query("SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'")).rowCount, 0);
    // No schema/role cleanup: destroy the entire isolated cluster after review.
    await query('BEGIN');
    await query(await readFile(new URL('../quarantine/000_roles.sql', import.meta.url), 'utf8'));
    const directories = await readdir(new URL('../quarantine/generated/', import.meta.url));
    assert.equal(directories.length, 1);
    await query(await readFile(new URL(`../quarantine/generated/${directories[0]}/migration.sql`, import.meta.url), 'utf8'));
    await query(await readFile(new URL('../quarantine/002_invariants_security.sql', import.meta.url), 'utf8'));
    await commit();

    // Two tenants; owner 1 in A, owner 2 in B; user 3 can receive ownership/invitation.
    await begin();
    for (const n of [1,2,3]) {
      await query('INSERT INTO global_users(id) VALUES ($1)', [uid(n)]);
      await query('INSERT INTO provider_identities(id,user_id,issuer,subject,verified_email) VALUES ($1,$2,$3,$4,$5)', [uid(n+10),uid(n),'https://issuer.invalid',String(n),`user${n}@example.invalid`]);
      await query("INSERT INTO sessions(id,user_id,identity_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')", [uid(n+20),uid(n),uid(n+10)]);
    }
    for (const [tenant,user,member] of [[101,1,201],[102,2,202]]) {
      await query("INSERT INTO organizations(id,name) VALUES ($1,'Disposable fixture')", [uid(tenant)]);
      await query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES ($1,$2,$3,'OWNER')", [uid(member),uid(tenant),uid(user)]);
      await query("UPDATE organizations SET status='active',version=version+1 WHERE id=$1", [uid(tenant)]);
    }
    await query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES ($1,$2,$3,'ADMIN')", [uid(203),uid(101),uid(3)]);
    await commit(); checks++;

    await runtime(async () => {
      assert.equal((await query('SELECT * FROM organizations')).rowCount, 1);
      assert.equal((await query('SELECT * FROM memberships WHERE organization_id=$1',[uid(102)])).rowCount,0);
      assert.equal((await query('SELECT * FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE o.id=$1',[uid(102)])).rowCount,0);
      assert.equal((await query('SELECT * FROM global_users')).rowCount,1);
      assert.equal((await query('SELECT * FROM sessions')).rowCount,1); checks++;
    });
    await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; }, null);
    await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; },1,21,102);
    await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; },1,22,101);
    // Same pooled connection after local context reset.
    await runtime(async () => { assert.equal((await query('SELECT * FROM memberships')).rowCount,0); checks++; }, null);
    for (const sql of ["INSERT INTO organizations(name) VALUES ('denied')", 'DELETE FROM memberships', "INSERT INTO memberships(organization_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','ADMIN')", "UPDATE memberships SET version=version+1 WHERE organization_id='00000000-0000-4000-8000-000000000102'", "DELETE FROM memberships WHERE organization_id='00000000-0000-4000-8000-000000000102'", 'UPDATE global_users SET version=version+1', 'TRUNCATE audit_events', 'SELECT * FROM provider_identities', 'SET ROLE hourvia_migration', 'ALTER TABLE organizations ADD COLUMN forbidden text', 'CREATE TABLE public.forbidden(id integer)', 'CREATE TEMP TABLE forbidden(id integer)', 'CREATE SCHEMA forbidden', 'CREATE ROLE forbidden', "SELECT public.hv_owner_count()"])
      await runtime(async () => denied(sql));
    await runtime(async () => {
      await query("SELECT set_config('hourvia.organization_id','malformed',true)");
      await denied('SELECT * FROM organizations', [], ['22P02']);
    });
    assert.equal((await query("SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n,8); checks++;
    const role = (await query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname='hourvia_runtime'")).rows[0];
    assert.ok(Object.values(role).every(v => v === false)); checks++;

    // Exercise FORCE RLS as the table owner with its permissive policy removed.
    // Without FORCE the owner would still see fixtures; this transaction is rolled back.
    await rollbackCase(async () => {
      await query('DROP POLICY migration_only ON memberships');
      assert.equal((await query('SELECT * FROM memberships')).rowCount, 0); checks++;
    });

    await rollbackCase(async () => denied("INSERT INTO memberships(organization_id,user_id,role) VALUES ($1,$2,'OWNER')",[uid(101),uid(2)]));
    await begin();
    await query("UPDATE memberships SET role='ADMIN',version=version+1 WHERE id=$1",[uid(201)]);
    await denied('COMMIT',[],['23514']); await query('ROLLBACK');
    await begin();
    await query("INSERT INTO organizations(name,status) VALUES ('Orphan','active')");
    await denied('COMMIT',[],['23514']); await query('ROLLBACK');
    await begin();
    await query("INSERT INTO organizations(name) VALUES ('Activation orphan') RETURNING id").then(async r => {
      await query("UPDATE organizations SET status='active',version=version+1 WHERE id=$1",[r.rows[0].id]);
    });
    await denied('COMMIT',[],['23514']); await query('ROLLBACK');
    await rollbackCase(async () => denied("UPDATE memberships SET status='revoked',version=version+1 WHERE id=$1",[uid(201)]));
    await rollbackCase(async () => denied("UPDATE memberships SET organization_id=$1,version=version+1 WHERE id=$2",[uid(102),uid(203)]));
    await rollbackCase(async () => denied("INSERT INTO invitations(organization_id,email,role,credential_digest,inviter_membership_id,expires_at) VALUES ($1,'a@example.invalid','EMPLOYEE',repeat('a',64),$2,now()+interval '1 hour')",[uid(102),uid(201)]));
    await rollbackCase(async () => denied("INSERT INTO audit_events(organization_id,actor_membership_id,action,target_id,correlation_id,aggregate_version) VALUES ($1,$2,'test',$3,$3,0)",[uid(102),uid(201),uid(1)]));

    await begin();
    await query("INSERT INTO invitations(id,organization_id,email,role,credential_digest,inviter_membership_id,expires_at) VALUES ($1,$2,'user3@example.invalid','EMPLOYEE',repeat('b',64),$3,now()+interval '1 hour')",[uid(301),uid(102),uid(202)]);
    await query("INSERT INTO audit_events(organization_id,actor_membership_id,action,target_id,correlation_id,aggregate_version) VALUES ($1,$2,'fixture',$3,$3,0)",[uid(102),uid(202),uid(301)]);
    await commit();
    for (const sql of ['UPDATE audit_events SET action=action', 'DELETE FROM audit_events', 'TRUNCATE audit_events']) await rollbackCase(async () => denied(sql));
    await runtime(async () => { assert.equal((await query('SELECT * FROM invitations')).rowCount,0); assert.equal((await query('SELECT * FROM audit_events')).rowCount,0); checks++; });
    await runtime(async () => { assert.equal((await query('SELECT * FROM invitations')).rowCount,1); checks++; },2,22,102);

    // Atomic invitation + membership rollback on injected error; retry starts from pending.
    async function accept(client) {
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[uid(102)]);
      const invite = (await client.query("SELECT * FROM invitations WHERE id=$1 AND state='pending' AND expires_at>statement_timestamp() FOR UPDATE",[uid(301)])).rows[0];
      assert.ok(invite); assert.equal(invite.email,'user3@example.invalid'); assert.equal(invite.credential_digest,'b'.repeat(64));
      await client.query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES ($1,$2,$3,'EMPLOYEE')",[uid(204),uid(102),uid(3)]);
      await client.query("UPDATE invitations SET state='accepted',accepted_membership_id=$1,accepted_at=transaction_timestamp(),version=version+1 WHERE id=$2",[uid(204),uid(301)]);
      await client.query('UPDATE organizations SET version=version+1 WHERE id=$1',[uid(102)]);
    }
    await begin(); await accept(admin); await query('ROLLBACK');
    assert.equal((await query('SELECT * FROM memberships WHERE id=$1',[uid(204)])).rowCount,0);
    assert.equal((await query('SELECT state FROM invitations WHERE id=$1',[uid(301)])).rows[0].state,'pending'); checks++;

    // Two connections contend on the same tenant lock; stale snapshot cannot consume twice.
    const other = await db.pool.connect();
    try {
      await begin(); await accept(admin); await begin(other);
      await other.query('SELECT version FROM organizations WHERE id=$1',[uid(102)]);
      const secondAccept = accept(other).then(() => 'unexpected').catch(e => e.code ?? 'rejected');
      await commit();
      assert.ok(['40001','55P03'].includes(await secondAccept)); await other.query('ROLLBACK'); checks++;
    } finally { other.release(); }
    await rollbackCase(async () => denied("UPDATE invitations SET state='revoked',version=version+1 WHERE id=$1",[uid(301)]));
    await rollbackCase(async () => denied("UPDATE invitations SET accepted_membership_id=$1,version=version+1 WHERE id=$2",[uid(203),uid(301)]));
    // Expired token remains invalid even when stored state is pending.
    await begin();
    await query("INSERT INTO invitations(id,organization_id,email,role,credential_digest,inviter_membership_id,created_at,expires_at) VALUES ($1,$2,'user1@example.invalid','EMPLOYEE',repeat('c',64),$3,now()-interval '2 hours',now()-interval '1 hour')",[uid(302),uid(102),uid(202)]);
    await commit();
    await rollbackCase(async () => denied("UPDATE invitations SET state='accepted',accepted_membership_id=$1,accepted_at=transaction_timestamp(),version=version+1 WHERE id=$2",[uid(204),uid(302)]));

    // A transaction begun before expiry cannot consume a token after wall-clock expiry.
    await begin();
    await query("INSERT INTO invitations(id,organization_id,email,role,credential_digest,inviter_membership_id,expires_at) VALUES ($1,$2,'late@example.invalid','EMPLOYEE',repeat('9',64),$3,clock_timestamp()+interval '100 milliseconds')",[uid(303),uid(102),uid(202)]);
    await query('SELECT pg_sleep(0.2)');
    await denied("UPDATE invitations SET state='accepted',accepted_membership_id=$1,accepted_at=transaction_timestamp(),version=version+1 WHERE id=$2",[uid(204),uid(303)]);
    await query('ROLLBACK');
    await rollbackCase(async () => denied("INSERT INTO invitations(organization_id,email,role,credential_digest,inviter_membership_id,expires_at,state,accepted_membership_id,accepted_at) VALUES ($1,'terminal@example.invalid','EMPLOYEE',repeat('8',64),$2,now()+interval '1 hour','accepted',$3,now())",[uid(102),uid(202),uid(204)]));

    // Idempotency claims cannot commit pending; completed outcomes are immutable and unique.
    await begin();
    await query("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest) VALUES ($1,'creator','provision','request_00000001',repeat('d',64))",[uid(1)]);
    await denied('COMMIT',[],['23514']); await query('ROLLBACK');
    await begin();
    await query("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_00000001',repeat('d',64),'completed',$2)",[uid(1),JSON.stringify({ organizationId: uid(101) })]);
    await commit();
    await rollbackCase(async () => denied("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_00000001',repeat('e',64),'completed','{}')",[uid(1)]));
    await rollbackCase(async () => denied("UPDATE idempotency_records SET outcome='{}',version=version+1"));
    await rollbackCase(async () => denied('DELETE FROM idempotency_records'));
    await runtime(async () => { assert.equal((await query('SELECT * FROM idempotency_records')).rowCount,0); checks++; });

    // Concurrent same-key claims serialize through uniqueness; no duplicate result is committed.
    const claimant = await db.pool.connect();
    try {
      await begin();
      await query("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_00000002',repeat('f',64),'completed','{}')",[uid(1)]);
      await begin(claimant);
      await claimant.query('SELECT count(*) FROM idempotency_records');
      const competing = claimant.query("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_00000002',repeat('f',64),'completed','{}')",[uid(1)]).then(() => 'unexpected').catch(e => e.code);
      await commit(); assert.ok(['23505','40001'].includes(await competing)); await claimant.query('ROLLBACK'); checks++;
    } finally { claimant.release(); }
    await rollbackCase(async () => denied("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','short',repeat('f',64),'completed','{}')",[uid(1)]));
    await rollbackCase(async () => denied("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_00000003','malformed','completed','{}')",[uid(1)]));
    await rollbackCase(async () => denied("INSERT INTO idempotency_records(actor_id,organization_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,$2,$2::text,'membership','request_00000003',repeat('f',64),'completed','{}')",[uid(1),uid(102)]));

    // Provisioning rollback removes the tenant, owner, audit, and claimed key together.
    await begin();
    await query("INSERT INTO organizations(id,name) VALUES ($1,'Rollback fixture')",[uid(103)]);
    await query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES ($1,$2,$3,'OWNER')",[uid(205),uid(103),uid(1)]);
    await query("UPDATE organizations SET status='active',version=version+1 WHERE id=$1",[uid(103)]);
    await query("INSERT INTO audit_events(organization_id,actor_membership_id,action,target_id,correlation_id,aggregate_version) VALUES ($1,$2,'provision',$1,$1,1)",[uid(103),uid(205)]);
    await query("INSERT INTO idempotency_records(actor_id,scope,operation,key,input_digest,state,outcome) VALUES ($1,'creator','provision','request_rollback_01',repeat('a',64),'completed','{}')",[uid(1)]);
    await denied('SELECT 1/0',[],['22012']); await query('ROLLBACK');
    for (const [table,column,value] of [['organizations','id',uid(103)],['memberships','id',uid(205)],['audit_events','organization_id',uid(103)],['idempotency_records','key','request_rollback_01']]) {
      assert.equal((await query(`SELECT * FROM ${table} WHERE ${column}=$1`,[value])).rowCount,0);
    }
    checks++;

    // PostgreSQL resolves COMMIT on an aborted transaction with a ROLLBACK tag.
    await begin();
    await denied('SELECT 1/0', [], ['22012']);
    assert.equal((await query('COMMIT')).command, 'ROLLBACK'); checks++;
    await begin();
    assert.equal((await query('SELECT 1 AS recovered')).rows[0].recovered, 1);
    await commit(); checks++;

    // Concurrent ownership transfers compare versions after acquiring the shared tenant lock.
    const contender = await db.pool.connect();
    try {
      await begin();
      const version = (await query('SELECT version FROM organizations WHERE id=$1 FOR UPDATE',[uid(101)])).rows[0].version;
      await begin(contender);
      await contender.query('SELECT version FROM organizations WHERE id=$1',[uid(101)]);
      const waiting = contender.query('SELECT version FROM organizations WHERE id=$1 FOR UPDATE',[uid(101)]).then(() => 'unexpected').catch(e => e.code);
      await query("UPDATE memberships SET role='ADMIN',version=version+1 WHERE id=$1",[uid(201)]);
      await query("UPDATE memberships SET role='OWNER',version=version+1 WHERE id=$1",[uid(203)]);
      await query('UPDATE organizations SET version=version+1 WHERE id=$1 AND version=$2',[uid(101),version]);
      await commit();
      assert.ok(['40001','55P03'].includes(await waiting)); await contender.query('ROLLBACK'); checks++;
    } finally { contender.release(); }
    assert.equal((await query("SELECT count(*)::integer AS n FROM memberships WHERE organization_id=$1 AND role='OWNER' AND status='active'",[uid(101)])).rows[0].n,1); checks++;

    // A request with a pre-revocation snapshot must abort, then reauthorize on retry.
    for (const status of ['suspended', 'revoked']) {
      const stale = await db.pool.connect();
      try {
        await begin(stale);
        assert.equal((await stale.query('SELECT status FROM memberships WHERE id=$1',[uid(204)])).rows[0].status,'active');
        await begin();
        await query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[uid(102)]);
        await query("UPDATE memberships SET status=$2,version=version+1 WHERE id=$1",[uid(204),status]);
        await query('UPDATE organizations SET version=version+1 WHERE id=$1',[uid(102)]);
        const staleLock = stale.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[uid(102)]).then(() => 'unexpected').catch(e => e.code);
        await commit();
        assert.equal(await staleLock,'40001'); await stale.query('ROLLBACK'); checks++;
      } finally { stale.release(); }
      await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; },3,23,102);
      if (status === 'suspended') {
        await begin();
        await query("UPDATE memberships SET status='active',version=version+1 WHERE id=$1",[uid(204)]);
        await query('UPDATE organizations SET version=version+1 WHERE id=$1',[uid(102)]);
        await commit();
      }
    }
    await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; },3,23,102);
    await begin(); await query('UPDATE sessions SET revoked_at=now(),version=version+1 WHERE id=$1',[uid(21)]); await commit();
    await runtime(async () => { assert.equal((await query('SELECT * FROM organizations')).rowCount,0); checks++; });
    assert.ok(checks >= 50, 'Required assertions did not complete');
  } finally {
    try { await query('ROLLBACK'); } catch { /* fail closed; never log driver errors */ }
    admin.release(); await db.pool.end();
  }
  console.log(`Disposable PostgreSQL checks passed: ${checks}. REQUIRED: destroy the authorized isolated cluster, including roles.`);
}
main().catch(() => { console.error('Disposable PostgreSQL checks failed or authorization gates rejected execution; details suppressed.'); process.exitCode = 1; });
