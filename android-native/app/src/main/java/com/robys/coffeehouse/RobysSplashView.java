package com.robys.coffeehouse;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.view.View;

public final class RobysSplashView extends View {
    private static final int LAUNCH_COLOR = Color.rgb(36, 28, 27);

    private final Paint focusPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Drawable markDrawable;
    private final Drawable wordmarkDrawable;

    public RobysSplashView(Context context) {
        super(context);
        markDrawable = context.getDrawable(R.drawable.ic_robys_splash_mark);
        wordmarkDrawable = context.getDrawable(R.drawable.ic_robys_wordmark);
        setBackgroundColor(LAUNCH_COLOR);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        float centerX = width * 0.5f;
        float centerY = height * 0.44f;
        float radius = Math.min(width * 0.58f, dp(220));
        focusPaint.setShader(new RadialGradient(
                centerX,
                centerY,
                radius,
                new int[] {
                        Color.argb(238, 255, 242, 218),
                        Color.argb(174, 255, 224, 181),
                        Color.argb(92, 211, 132, 67),
                        Color.TRANSPARENT
                },
                new float[] {0f, 0.30f, 0.58f, 1f},
                Shader.TileMode.CLAMP
        ));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float centerX = getWidth() * 0.5f;
        float centerY = getHeight() * 0.44f;
        float radius = Math.min(getWidth() * 0.58f, dp(220));
        canvas.drawCircle(centerX, centerY, radius, focusPaint);

        drawCentered(canvas, markDrawable, centerX, centerY - dp(42), dp(46));
        drawCentered(canvas, wordmarkDrawable, centerX, centerY + dp(38), Math.min((int) (getWidth() * 0.60f), dp(230)));
    }

    public void resetAndShow() {
        setAlpha(1f);
        setVisibility(VISIBLE);
    }

    public void dismiss() {
        setVisibility(GONE);
    }

    private void drawCentered(Canvas canvas, Drawable drawable, float centerX, float centerY, int targetWidth) {
        if (drawable == null || targetWidth <= 0) return;
        int intrinsicWidth = Math.max(1, drawable.getIntrinsicWidth());
        int intrinsicHeight = Math.max(1, drawable.getIntrinsicHeight());
        int targetHeight = Math.max(1, Math.round(targetWidth * (intrinsicHeight / (float) intrinsicWidth)));
        int left = Math.round(centerX - targetWidth / 2f);
        int top = Math.round(centerY - targetHeight / 2f);
        drawable.setBounds(left, top, left + targetWidth, top + targetHeight);
        drawable.draw(canvas);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
