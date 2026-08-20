package app.togethercity.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

final class Scheduler {

    private static final int JOB_PERIODIC = 1;
    private static final int JOB_ONESHOT = 2;
    private static final long PERIOD_MS = 15 * 60 * 1000L;

    private Scheduler() {}

    /** Periodic job + the Doze-piercing alarm chain. Safe to call repeatedly. */
    static void ensureScheduled(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js.getPendingJob(JOB_PERIODIC) == null) {
            js.schedule(new JobInfo.Builder(JOB_PERIODIC, new ComponentName(c, NotifyJobService.class))
                    .setPeriodic(PERIOD_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)   // survives reboot (RECEIVE_BOOT_COMPLETED)
                    .build());
        }
        nextAlarm(c);
    }

    /** One-shot poll, deadline zero: runs at the first moment the OS allows. */
    static void runOneShot(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        js.schedule(new JobInfo.Builder(JOB_ONESHOT, new ComponentName(c, NotifyJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setOverrideDeadline(0)
                .build());
    }

    /** Chain the next alarm ~15 min out. allow-while-idle fires inside Doze's
     *  maintenance windows (the OS throttles to roughly one per 9–15 min —
     *  exactly our cadence). */
    static void nextAlarm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, AlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + PERIOD_MS, pi);
    }
}
