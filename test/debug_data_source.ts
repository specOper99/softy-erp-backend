import * as ds from '../src/database/data-source';

try {
  console.log('Loaded DataSource:', ds.default ? 'YES' : 'NO');
} catch (error) {
  console.error('Error loading DataSource:', error);
}
