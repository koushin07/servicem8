import dotenv from 'dotenv';
import express from 'express';
import oauthRoutes from './controllers/oauthRoutes';
import webhookRoutes from './controllers/webhookRoutes';


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/', oauthRoutes);
app.use('/webhook', webhookRoutes);

app.use((req, res, next) => {
	console.log(`[${req.method}] ${req.originalUrl}`);
	next();
});

app.listen(PORT, async () => {
	console.log(`Server running on port ${PORT}`);
});
