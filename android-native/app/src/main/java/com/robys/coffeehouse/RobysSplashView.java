package com.robys.coffeehouse;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;

public final class RobysSplashView extends View {
    private static final long DURATION_MS = 1850L;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path steamPath = new Path();
    private final Drawable brandWordmark;

    private long startedAt;
    private boolean motionStarted;
    private boolean dismissed;
    private Runnable motionStartedListener;

    public RobysSplashView(Context context) {
        super(context);
        setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setBackgroundColor(Color.WHITE);
        brandWordmark = context.getDrawable(R.drawable.ic_robys_wordmark);

        textPaint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        textPaint.setTextAlign(Paint.Align.CENTER);

        resetAndShow();
    }

    public void setOnMotionStartedListener(Runnable listener) {
        motionStartedListener = listener;
    }

    public void resetAndShow() {
        animate().cancel();
        dismissed = false;
        motionStarted = false;
        startedAt = 0L;
        setAlpha(1f);
        setVisibility(VISIBLE);
        invalidate();
    }

    public void startMotion() {
        if (dismissed || motionStarted) {
            return;
        }
        motionStarted = true;
        startedAt = SystemClock.uptimeMillis();
        if (motionStartedListener != null) {
            motionStartedListener.run();
        }
        invalidate();
    }

    public void dismiss() {
        if (dismissed) {
            return;
        }
        dismissed = true;
        animate()
                .alpha(0f)
                .setDuration(220L)
                .withEndAction(() -> setVisibility(GONE))
                .start();
    }

    public void dismissWhenMotionComplete() {
        if (reducedMotion()) {
            dismiss();
            return;
        }
        if (startedAt == 0L) {
            postDelayed(this::dismissWhenMotionComplete, 16L);
            return;
        }
        long elapsed = SystemClock.uptimeMillis() - startedAt;
        long delay = Math.max(0L, DURATION_MS - elapsed);
        postDelayed(this::dismiss, delay);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        float progress = reducedMotion()
                ? 1f
                : startedAt == 0L
                        ? 0f
                        : clamp((SystemClock.uptimeMillis() - startedAt) / (float) DURATION_MS);

        float cx = getWidth() * 0.5f;
        float cy = getHeight() * 0.43f;
        float unit = Math.min(getWidth(), getHeight()) / 10f;

        drawBean(canvas, cx, cy, unit, progress);
        drawCup(canvas, cx, cy, unit, progress);
        drawSteam(canvas, cx, cy, unit, progress);
        drawBrand(canvas, cx, cy, unit, progress);

        if (!reducedMotion() && startedAt != 0L && progress < 1f && !dismissed) {
            postInvalidateOnAnimation();
        }
    }

    private void drawBean(Canvas canvas, float cx, float cy, float unit, float progress) {
        float visible = 1f - smoothstep(0.24f, 0.52f, progress);
        if (visible <= 0f) {
            return;
        }

        canvas.save();
        canvas.rotate(-28f + 110f * smoothstep(0f, 0.38f, progress), cx, cy);
        float scale = 0.74f + 0.18f * smoothstep(0f, 0.26f, progress);
        canvas.scale(scale, scale, cx, cy);

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(93, 57, 43));
        paint.setAlpha(Math.round(255f * visible));

        RectF bean = new RectF(
                cx - unit * 0.60f,
                cy - unit * 0.82f,
                cx + unit * 0.60f,
                cy + unit * 0.82f
        );
        canvas.drawOval(bean, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(unit * 0.09f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(Color.rgb(232, 215, 198));
        paint.setAlpha(Math.round(220f * visible));

        Path seam = new Path();
        seam.moveTo(cx - unit * 0.16f, cy - unit * 0.65f);
        seam.cubicTo(
                cx + unit * 0.27f, cy - unit * 0.22f,
                cx - unit * 0.27f, cy + unit * 0.22f,
                cx + unit * 0.16f, cy + unit * 0.65f
        );
        canvas.drawPath(seam, paint);
        canvas.restore();
    }

    private void drawCup(Canvas canvas, float cx, float cy, float unit, float progress) {
        float reveal = smoothstep(0.30f, 0.67f, progress);
        if (reveal <= 0f) {
            return;
        }

        float cupY = cy + unit * 0.08f;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(unit * 0.10f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setColor(Color.rgb(22, 17, 15));
        paint.setAlpha(Math.round(255f * reveal));

        Path cup = new Path();
        cup.moveTo(cx - unit * 0.72f, cupY - unit * 0.35f);
        cup.lineTo(cx - unit * 0.55f, cupY + unit * 0.55f);
        cup.quadTo(cx, cupY + unit * 0.78f, cx + unit * 0.55f, cupY + unit * 0.55f);
        cup.lineTo(cx + unit * 0.72f, cupY - unit * 0.35f);
        canvas.drawPath(cup, paint);

        RectF handle = new RectF(
                cx + unit * 0.58f,
                cupY - unit * 0.18f,
                cx + unit * 1.12f,
                cupY + unit * 0.42f
        );
        canvas.drawArc(handle, -78f, 160f * reveal, false, paint);

        paint.setStrokeWidth(unit * 0.075f);
        canvas.drawLine(
                cx - unit * 0.88f,
                cupY + unit * 0.82f,
                cx + unit * 0.88f,
                cupY + unit * 0.82f,
                paint
        );

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(226, 27, 35));
        paint.setAlpha(Math.round(255f * smoothstep(0.48f, 0.72f, progress)));
        canvas.drawCircle(cx, cupY + unit * 0.18f, unit * 0.17f, paint);
    }

    private void drawSteam(Canvas canvas, float cx, float cy, float unit, float progress) {
        float reveal = smoothstep(0.48f, 0.82f, progress);
        if (reveal <= 0f) {
            return;
        }

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(unit * 0.065f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(Color.rgb(106, 67, 50));
        paint.setAlpha(Math.round(210f * reveal));

        for (int i = -1; i <= 1; i++) {
            float x = cx + i * unit * 0.34f;
            float phase = i * unit * 0.08f;
            steamPath.reset();
            steamPath.moveTo(x, cy - unit * 0.52f);
            steamPath.cubicTo(
                    x - unit * 0.20f, cy - unit * 0.84f + phase,
                    x + unit * 0.20f, cy - unit * 1.10f,
                    x, cy - unit * 1.42f
            );
            canvas.drawPath(steamPath, paint);
        }
    }

    private void drawBrand(Canvas canvas, float cx, float cy, float unit, float progress) {
        float reveal = smoothstep(0.64f, 0.96f, progress);
        if (reveal <= 0f) {
            return;
        }

        int wordmarkWidth = Math.round(unit * 2.90f);
        int wordmarkHeight = Math.round(wordmarkWidth * (79f / 251f));
        int wordmarkLeft = Math.round(cx - wordmarkWidth / 2f);
        int wordmarkTop = Math.round(cy + unit * 1.82f);

        if (brandWordmark != null) {
            brandWordmark.setAlpha(Math.round(255f * reveal));
            brandWordmark.setBounds(
                    wordmarkLeft,
                    wordmarkTop,
                    wordmarkLeft + wordmarkWidth,
                    wordmarkTop + wordmarkHeight
            );
            brandWordmark.draw(canvas);
        }

        textPaint.setAlpha(Math.round(255f * reveal));
        textPaint.setLetterSpacing(0.18f);
        textPaint.setTextSize(unit * 0.20f);
        textPaint.setColor(Color.rgb(106, 67, 50));
        canvas.drawText("COFFEE HOUSE", cx, cy + unit * 3.12f, textPaint);
        textPaint.setLetterSpacing(0f);
    }

    private boolean reducedMotion() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ValueAnimator.areAnimatorsEnabled();
    }

    private static float smoothstep(float start, float end, float value) {
        float t = clamp((value - start) / (end - start));
        return t * t * (3f - 2f * t);
    }

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }
}
