import express from 'express';

const app = express();

app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

import authRoutes from './routes/auth.routes';
import neighborhoodsRoutes from './routes/neighborhoods.routes';
import geoRoutes from "./routes/geo.routes";

app.use('/auth', authRoutes);
app.use('/neighborhoods', neighborhoodsRoutes);
app.use("/geo", geoRoutes);


export default app;


