package app.togethercity.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Belt-and-braces: setPersisted(true) should survive reboot; this makes sure. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            NotifyJobService.createChannels(context);
            Scheduler.ensureScheduled(context);   // periodic job + alarm chain
        }
    }
}
