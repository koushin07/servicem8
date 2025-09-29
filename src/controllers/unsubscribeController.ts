import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const suppressionListPath = path.join(__dirname, '../globals/suppressionList.json');

function getSuppressionList(): string[] {
	if (!fs.existsSync(suppressionListPath)) return [];
	return JSON.parse(fs.readFileSync(suppressionListPath, 'utf8'));
}

function saveSuppressionList(list: string[]): void {
	fs.writeFileSync(suppressionListPath, JSON.stringify(list, null, 2));
}

export function unsubscribe(req: Request, res: Response): void {
	const { email } = req.query as { email?: string };
	if (!email) {
		res.status(400).send('Missing email');
		return;
	}
	let list = getSuppressionList();
	if (email && !list.includes(email)) list.push(email);
	saveSuppressionList(list);
	res.send('You have been unsubscribed.');
}

export function isSuppressed(email: string): boolean {
	const list = getSuppressionList();
	return email ? list.includes(email) : false;
}
