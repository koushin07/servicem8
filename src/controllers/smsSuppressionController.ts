// Handles SMS STOP/UNSTOP and phone suppression
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const smsSuppressionPath = path.join(__dirname, '../globals/smsSuppressionList.json');

function getSmsSuppressionList(): string[] {
	if (!fs.existsSync(smsSuppressionPath)) return [];
	return JSON.parse(fs.readFileSync(smsSuppressionPath, 'utf8'));
}

function saveSmsSuppressionList(list: string[]): void {
	fs.writeFileSync(smsSuppressionPath, JSON.stringify(list, null, 2));
}

export function handleInboundSms(req: Request, res: Response): void {
	// Example: ServiceM8 or SMS provider webhook posts { from: "+61412345678", message: "STOP" }
	const { from, message } = req.body as { from?: string; message?: string };
	if (!from || !message) {
		res.status(400).send('Missing from or message');
		return;
	}
	let list = getSmsSuppressionList();
	if (/^stop$/i.test(message.trim())) {
		if (!list.includes(from)) list.push(from);
		saveSmsSuppressionList(list);
		res.send('You have been unsubscribed from SMS.');
		return;
	}
	if (/^unstop$/i.test(message.trim())) {
		list = list.filter(num => num !== from);
		saveSmsSuppressionList(list);
		res.send('You have been resubscribed to SMS.');
		return;
	}
	res.send('No action taken.');
}

export function isSmsSuppressed(phone: string): boolean {
	const list = getSmsSuppressionList();
	return list.includes(phone);
}
