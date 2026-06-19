import { registerAs } from '@nestjs/config';
import { parseEnvInt } from '../common/utils/env-int.util';

export default registerAs('booking', () => ({
  maxTasksPerBooking: parseEnvInt(process.env.MAX_TASKS_PER_BOOKING, 500),
}));
