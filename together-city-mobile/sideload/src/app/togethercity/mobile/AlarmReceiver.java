package app.togethercity.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The alarm half of the poller. JobScheduler's 15-minute periodic job is the
 * primary; Doze and Samsung's app-sleep can stretch or starve it. This chain
 * — setAndAllowWhileIdle → one-shot job with a zero deadline → next alarm —
 * pierces Doze's maintenance windows, so a check still runs even when the
 * phone has been face-down on a desk all afternoon.
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Scheduler.runOneShot(context);   // poll as soon as the scheduler allows
        Scheduler.nextAlarm(context);    // and keep the chain alive
    }
}
