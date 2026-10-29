package app.pepperedapron.videospeech

import org.junit.Assert.assertEquals
import org.junit.Test

class ResamplerTest {
  @Test
  fun averagesChannelsAndKeeps16kAsIs() {
    val stereo = floatArrayOf(1f, 0f, 0.5f, 0.5f, -1f, 1f)
    val mono = Resampler.toMono16k(stereo, 16_000, 2)
    assertEquals(listOf(0.5f, 0.5f, 0f), mono.toList())
  }

  @Test
  fun resamples44100ToAboutOneThird() {
    val oneSecond = FloatArray(44_100) { (it % 100) / 100f }
    val out = Resampler.toMono16k(oneSecond, 44_100, 1)
    assertEquals(16_000, out.size)
    assertEquals(oneSecond[0], out[0], 1e-6f)
  }

  @Test
  fun interpolatesBetweenSamples() {
    val ramp = floatArrayOf(0f, 1f, 2f, 3f)
    val out = Resampler.toMono16k(ramp, 32_000, 1)
    assertEquals(listOf(0f, 2f), out.toList())
  }
}
