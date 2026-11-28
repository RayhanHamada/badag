import journal from './meta/_journal.json';
import m0000 from './0000_outgoing_shatterstar.sql';
import m0001 from './0001_run_linkage.sql';

  export default {
    journal,
    migrations: {
      m0000,
      m0001
    }
  }
