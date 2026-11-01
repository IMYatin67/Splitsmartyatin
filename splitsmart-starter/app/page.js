'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const demoEmailKey = 'splitsmart-demo-email';
const localDemoKey = 'splitsmart-local-demo';
const localGroupsKey = 'splitsmart-local-groups';
const expenseStorageKey = (email) => `splitsmart-demo-expenses:${encodeURIComponent(email)}`;
const activeGroupKey = 'splitsmart-active-group';

function readLocalGroups() {
	try {
		const groups = JSON.parse(localStorage.getItem(localGroupsKey) || '[]');
		return Array.isArray(groups) ? groups : [];
	} catch {
		return [];
	}
}

function createLocalSession(email) {
	return { user: { id: `local:${email}`, email }, isLocalDemo: true };
}

async function fetchUserGroups(userId) {
	const { data: memberships, error: membershipError } = await supabase
		.from('group_members')
		.select('group_id')
		.eq('user_id', userId);
	if (membershipError) throw membershipError;

	const groupIds = (memberships || []).map((membership) => membership.group_id);
	if (groupIds.length === 0) return [];

	const { data: groups, error: groupError } = await supabase
		.from('groups')
		.select('id, name, join_code, created_at')
		.in('id', groupIds)
		.order('created_at', { ascending: true });
	if (groupError) throw groupError;
	return groups || [];
}

export default function Home() {
	const [session, setSession] = useState(null);
	const [checking, setChecking] = useState(true);
	const [expenses, setExpenses] = useState([]);
	const [text, setText] = useState('');
	const [email, setEmail] = useState('');
	const [authMsg, setAuthMsg] = useState('');
	const [groups, setGroups] = useState([]);
	const [activeGroupId, setActiveGroupId] = useState('');
	const [groupName, setGroupName] = useState('');
	const [joinCode, setJoinCode] = useState('');
	const [groupMsg, setGroupMsg] = useState('');
	const [groupBusy, setGroupBusy] = useState(false);

	useEffect(() => {
		const restoreSession = async () => {
			const savedEmail = localStorage.getItem(demoEmailKey) || '';
			const { data, error } = await supabase.auth.getSession();
			setEmail(savedEmail);
			const localSession = localStorage.getItem(localDemoKey) === 'true' && savedEmail
				? createLocalSession(savedEmail)
				: null;
			setSession(data.session || localSession);
			if (error) setAuthMsg(error.message);
			setChecking(false);
		};
		restoreSession();
		const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			if (nextSession) setSession(nextSession);
			else if (localStorage.getItem(localDemoKey) !== 'true') setSession(null);
		});
		return () => authListener.subscription.unsubscribe();
	}, []);

	useEffect(() => {
		let cancelled = false;
		if (!session) {
			setGroups([]);
			setActiveGroupId('');
			setExpenses([]);
			return () => { cancelled = true; };
		}
		const loadGroups = async () => {
			setGroupMsg('');
			try {
				const userGroups = session.isLocalDemo
					? readLocalGroups().filter((group) => group.members.includes(email))
					: await fetchUserGroups(session.user.id);
				if (cancelled) return;
				setGroups(userGroups);
				const savedGroupId = localStorage.getItem(activeGroupKey);
				const selectedGroup = userGroups.find((group) => group.id === savedGroupId) || userGroups[0];
				setActiveGroupId(selectedGroup?.id || '');
			} catch (error) {
				if (!cancelled) setGroupMsg(`Could not load groups: ${error.message}`);
			}
		};
		loadGroups();
		return () => { cancelled = true; };
	}, [session, email]);

	useEffect(() => {
		let cancelled = false;
		if (!session || !activeGroupId) {
			setExpenses([]);
			return () => { cancelled = true; };
		}
		localStorage.setItem(activeGroupKey, activeGroupId);
		if (session.isLocalDemo) {
			const localGroup = readLocalGroups().find((group) => group.id === activeGroupId && group.members.includes(email));
			setExpenses(localGroup?.expenses || []);
			return () => { cancelled = true; };
		}
		const loadExpenses = async () => {
			const { data, error } = await supabase
				.from('expenses')
				.select('*')
				.eq('group_id', activeGroupId)
				.order('created_at', { ascending: true });
			if (cancelled) return;
			if (error) setGroupMsg(`Could not load group expenses: ${error.message}`);
			else setExpenses(data || []);
		};
		loadExpenses();
		return () => { cancelled = true; };
	}, [session, activeGroupId, email]);

	const signIn = () => {
		setAuthMsg('');
		const normalizedEmail = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			setAuthMsg('Enter a valid email address to continue.');
			return;
		}
		setGroupBusy(true);
		supabase.auth.signInAnonymously().then(({ data, error }) => {
			if (error) {
				if (error.message.toLowerCase().includes('anonymous sign-ins are disabled')) {
					localStorage.setItem(demoEmailKey, normalizedEmail);
					localStorage.setItem(localDemoKey, 'true');
					setEmail(normalizedEmail);
					setSession(createLocalSession(normalizedEmail));
				} else {
					setAuthMsg(`Could not start a demo session: ${error.message}`);
				}
				return;
			}
			localStorage.removeItem(localDemoKey);
			localStorage.setItem(demoEmailKey, normalizedEmail);
			setEmail(normalizedEmail);
			setSession(data.session);
		}).finally(() => setGroupBusy(false));
	};
	const signOut = async () => {
		if (!session.isLocalDemo) await supabase.auth.signOut();
		localStorage.removeItem(demoEmailKey);
		localStorage.removeItem(localDemoKey);
		localStorage.removeItem(activeGroupKey);
		setSession(null);
		setExpenses([]);
	};
	const createGroup = async (event) => {
		event.preventDefault();
		const name = groupName.trim();
		if (!name) return;
		setGroupBusy(true);
		setGroupMsg('');
		if (session.isLocalDemo) {
			const localGroups = readLocalGroups();
			let joinCode;
			do {
				joinCode = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
			} while (localGroups.some((group) => group.join_code === joinCode));
			const localExpenses = JSON.parse(localStorage.getItem(expenseStorageKey(email)) || '[]');
			const group = {
				id: crypto.randomUUID(),
				name,
				join_code: joinCode,
				created_at: new Date().toISOString(),
				members: [email],
				expenses: Array.isArray(localExpenses) ? localExpenses : [],
			};
			localGroups.push(group);
			localStorage.setItem(localGroupsKey, JSON.stringify(localGroups));
			if (group.expenses.length) localStorage.removeItem(expenseStorageKey(email));
			setGroups(localGroups.filter((item) => item.members.includes(email)));
			setActiveGroupId(group.id);
			setGroupName('');
			setGroupMsg(`Group created. Share join code ${group.join_code} with another session in this browser.`);
			setGroupBusy(false);
			return;
		}
		const { data: group, error: createError } = await supabase
			.from('groups')
			.insert({ name, created_by: session.user.id })
			.select('id, name, join_code, created_at')
			.single();
		if (createError) {
			setGroupMsg(`Could not create group: ${createError.message}`);
			setGroupBusy(false);
			return;
		}
		const { error: memberError } = await supabase
			.from('group_members')
			.insert({ group_id: group.id, user_id: session.user.id });
		if (memberError) {
			setGroupMsg(`Group created, but membership failed: ${memberError.message}`);
			setGroupBusy(false);
			return;
		}

		let message = `Group created. Share join code ${group.join_code} with your group.`;
		try {
			const localExpenses = JSON.parse(localStorage.getItem(expenseStorageKey(email)) || '[]');
			if (localExpenses.length) {
				const { error: importError } = await supabase.from('expenses').insert(localExpenses.map((expense) => ({
					group_id: group.id,
					user_id: session.user.id,
					name: expense.name,
					paid_by: expense.paid_by || 'You',
					amount: expense.amount || 0,
				})));
				if (importError) message += ` Your previous local expenses are still saved in this browser: ${importError.message}`;
				else localStorage.removeItem(expenseStorageKey(email));
			}
		} catch {
			message += ' Previous local expenses could not be imported and remain in this browser.';
		}
		setGroupName('');
		setGroupMsg(message);
		try {
			const userGroups = await fetchUserGroups(session.user.id);
			setGroups(userGroups);
			setActiveGroupId(group.id);
		} catch (error) {
			setGroupMsg(`Group created, but could not refresh the group list: ${error.message}`);
		}
		setGroupBusy(false);
	};
	const joinGroup = async (event) => {
		event.preventDefault();
		if (!joinCode.trim()) return;
		setGroupBusy(true);
		setGroupMsg('');
		if (session.isLocalDemo) {
			const localGroups = readLocalGroups();
			const group = localGroups.find((item) => item.join_code === joinCode.trim().toUpperCase());
			if (!group) {
				setGroupMsg('No local group has that code. Local demo groups are only available in this browser.');
				setGroupBusy(false);
				return;
			}
			if (!group.members.includes(email)) group.members.push(email);
			localStorage.setItem(localGroupsKey, JSON.stringify(localGroups));
			setGroups(localGroups.filter((item) => item.members.includes(email)));
			setActiveGroupId(group.id);
			setJoinCode('');
			setGroupMsg('You joined the group.');
			setGroupBusy(false);
			return;
		}
		const { data: groupId, error } = await supabase.rpc('join_group', { code: joinCode.trim().toUpperCase() });
		if (error) {
			setGroupMsg(`Could not join group: ${error.message}`);
			setGroupBusy(false);
			return;
		}
		setJoinCode('');
		try {
			setGroups(await fetchUserGroups(session.user.id));
			setActiveGroupId(groupId);
			setGroupMsg('You joined the group.');
		} catch (refreshError) {
			setGroupMsg(`Joined, but could not refresh the group list: ${refreshError.message}`);
		}
		setGroupBusy(false);
	};

	const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

	const addExpense = async () => {
		const t = text.trim();
		if (!t) return;
		try {
			const res = await fetch('/api/parse-expense', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: t }),
			});
			if (!res.headers.get('content-type')?.includes('application/json')) {
				throw new Error('Expense parser returned an unexpected response. Check that the dev server is running the current app.');
			}
			const data = await res.json();
			if (!res.ok || data.error) { alert('AI error: ' + (data.error || `Request failed (${res.status}).`)); return; }
			const parsedExpense = data.expense;
			if (!parsedExpense) throw new Error('Expense parser returned an invalid response.');
			if (session.isLocalDemo) {
				const localGroups = readLocalGroups();
				const group = localGroups.find((item) => item.id === activeGroupId && item.members.includes(email));
				if (!group) throw new Error('Select a group before adding an expense.');
				const expense = {
					id: crypto.randomUUID(),
					name: parsedExpense.name || t,
					paid_by: parsedExpense.paidBy || 'You',
					amount: parsedExpense.amount || 0,
				};
				group.expenses.push(expense);
				localStorage.setItem(localGroupsKey, JSON.stringify(localGroups));
				setExpenses(group.expenses);
				setText('');
				return;
			}
			const { data: expense, error: saveError } = await supabase.from('expenses').insert({
				group_id: activeGroupId,
				user_id: session.user.id,
				name: parsedExpense.name || t,
				paid_by: parsedExpense.paidBy || 'You',
				amount: parsedExpense.amount || 0,
			}).select().single();
			if (saveError) { alert('Save error: ' + saveError.message); return; }
			setExpenses((currentExpenses) => [...currentExpenses, expense]);
			setText('');
		} catch (e) { alert('Could not add: ' + e.message); }
	};

	const removeExpense = async (id) => {
		if (session.isLocalDemo) {
			const localGroups = readLocalGroups();
			const group = localGroups.find((item) => item.id === activeGroupId && item.members.includes(email));
			if (!group) return;
			group.expenses = group.expenses.filter((expense) => expense.id !== id);
			localStorage.setItem(localGroupsKey, JSON.stringify(localGroups));
			setExpenses(group.expenses);
			return;
		}
		const { error } = await supabase.from('expenses').delete().eq('id', id).eq('group_id', activeGroupId);
		if (error) { alert('Could not remove expense: ' + error.message); return; }
		setExpenses((currentExpenses) => currentExpenses.filter((expense) => expense.id !== id));
	};

	if (checking) return <main style={styles.page}><div style={styles.card}>Loading…</div></main>;

	if (!session) {
		return (
			<main style={styles.page}>
				<div style={styles.card}>
					<div style={styles.header}><div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div></div>
					<p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Enter an email to start a password-free demo session and create or join groups.</p>
					<input style={styles.input2} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
					<button style={styles.authBtn} onClick={signIn} disabled={groupBusy}>{groupBusy ? 'Connecting…' : 'Continue with email'}</button>
					{authMsg && <div style={{ marginTop: 12, fontSize: 13, color: '#1C5FD4' }}>{authMsg}</div>}
				</div>
			</main>
		);
	}

	return (
		<main style={styles.page}>
			<div style={styles.card}>
				<div style={styles.header}>
					<div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div>
					<button style={styles.signout} onClick={signOut}>Sign out</button>
				</div>
				<section style={styles.groups}>
					<div style={styles.sectionLabel}>GROUPS</div>
					<select style={styles.groupSelect} value={activeGroupId} onChange={(event) => setActiveGroupId(event.target.value)} disabled={groups.length === 0 || groupBusy}>
						<option value="">Choose a group</option>
						{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
					</select>
					{groups.find((group) => group.id === activeGroupId) && (
						<div style={styles.groupCode}>Join code <strong>{groups.find((group) => group.id === activeGroupId).join_code}</strong></div>
					)}
					{session.isLocalDemo && <div style={styles.groupMsg}>Local demo mode: groups are saved in this browser and do not sync across devices.</div>}
					<div style={styles.groupActions}>
						<form style={styles.groupForm} onSubmit={createGroup}>
							<input style={styles.groupInput} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New group name" maxLength={60} />
							<button style={styles.groupButton} disabled={groupBusy}>Create</button>
						</form>
						<form style={styles.groupForm} onSubmit={joinGroup}>
							<input style={styles.groupInput} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Join code" maxLength={12} />
							<button style={styles.groupButton} disabled={groupBusy}>Join</button>
						</form>
					</div>
					{groupMsg && <div style={styles.groupMsg}>{groupMsg}</div>}
				</section>
				{activeGroupId ? <div style={styles.addRow}>
					<input style={styles.input} value={text} onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addExpense()} placeholder="Add an expense…" />
					<button style={styles.addBtn} onClick={addExpense}>+</button>
				</div> : <div style={styles.empty}>Create a group or enter a join code to start sharing expenses.</div>}
				<div style={styles.list}>
					{activeGroupId && expenses.length === 0 && <div style={styles.empty}>No expenses yet — add your first one above.</div>}
					{expenses.map((e) => (
						<div key={e.id} style={styles.item}>
							<div style={styles.itemEmoji}>{e.emoji || '🧾'}</div>
							<div style={styles.itemMain}>
								<div style={styles.itemName}>{e.name}</div>
								<div style={styles.itemPaid}>paid by {e.paid_by}</div>
							</div>
							<div style={styles.itemAmount}>{inr(e.amount)}</div>
							<button style={styles.remove} onClick={() => removeExpense(e.id)}>×</button>
						</div>
					))}
				</div>
				<div style={styles.total}>Total {inr(total)}</div>
			</div>
		</main>
	);
}

const styles = {
	page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px' },
	card: { width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20, marginTop: 12 },
	header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
	groups: { borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 16 },
	sectionLabel: { color: 'var(--muted)', fontSize: 11, fontWeight: 800, marginBottom: 8 },
	groupSelect: { width: '100%', minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, background: '#fff', color: 'var(--ink)' },
	groupCode: { marginTop: 8, color: 'var(--muted)', fontSize: 13 },
	groupActions: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 10 },
	groupForm: { display: 'flex', gap: 8, minWidth: 0 },
	groupInput: { flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', background: '#f7f9fc' },
	groupButton: { flex: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 13px', color: 'var(--ink)', fontSize: 14, fontWeight: 700, background: '#fff', cursor: 'pointer' },
	groupMsg: { color: 'var(--muted)', fontSize: 12, marginTop: 10, overflowWrap: 'anywhere' },
	brand: { display: 'flex', alignItems: 'center', gap: 10 },
	logo: { width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' },
	title: { fontSize: 20, fontWeight: 800 },
	signout: { border: '1px solid var(--line)', background: '#fff', borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' },
	addRow: { display: 'flex', gap: 10, marginBottom: 16 },
	input: { flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', fontSize: 15, outline: 'none', background: '#f7f9fc' },
	input2: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', background: '#f7f9fc', marginBottom: 10, boxSizing: 'border-box' },
	authBtn: { flex: 1, border: 'none', borderRadius: 12, padding: '12px', color: '#fff', fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
	addBtn: { flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
	list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
	empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
	item: { display: 'flex', alignItems: 'center', gap: 12, background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px' },
	itemEmoji: { width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid var(--line)', fontSize: 19, flex: 'none' },
	itemMain: { flex: 1, minWidth: 0 },
	itemName: { fontWeight: 700, fontSize: 15 },
	itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
	itemAmount: { fontWeight: 800, fontSize: 15.5 },
	remove: { flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
	total: { textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', fontWeight: 800, fontSize: 16 },
};
