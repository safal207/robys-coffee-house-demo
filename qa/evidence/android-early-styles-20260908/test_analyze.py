import copy
import unittest
from analyze import align_readiness, native_windows, union


class ClockAndWindowTests(unittest.TestCase):
    def snapshot(self):
        return {'state':'captured','error':None,'start_elapsed_ns':100_000_000_000,
                'request_elapsed_ns':155_000_000_000,'callback_elapsed_ns':155_200_000_000,
                'payload':{'now_ms':55_100,'href':'test',
                    'snapshot':{'dropped':0,'events':[{'phase':'state','detail':'ready','atMs':4000}]}}}

    def test_clock_translation_preserves_relative_interval(self):
        original=self.snapshot()
        before=align_readiness(original,100_000_000_000,101_000_000_000,104_000_000_000)
        shifted=copy.deepcopy(original)
        offset=900_000_000_000
        for field in ('start_elapsed_ns','request_elapsed_ns','callback_elapsed_ns'):
            shifted[field]+=offset
        after=align_readiness(shifted,100_000_000_000+offset,101_000_000_000+offset,104_000_000_000+offset)
        self.assertEqual(before['events'][0]['since_native_ms_interval'],[3900,4100])
        self.assertEqual(before['events'][0]['since_native_ms_interval'],after['events'][0]['since_native_ms_interval'])
        self.assertEqual(before['events'][0]['since_commit_ms_interval'],after['events'][0]['since_commit_ms_interval'])
        self.assertEqual(before['alignment_width_ms'],200)

    def test_invalid_clock_is_rejected(self):
        value=self.snapshot();value['callback_elapsed_ns']=value['request_elapsed_ns']-1
        with self.assertRaises(ValueError):align_readiness(value,1,None,None)

    def test_missing_snapshot_never_fabricates_ready(self):
        self.assertFalse(align_readiness({'state':'destroyed'},1,None,None)['available'])

    def test_failure_never_becomes_completed_window(self):
        self.assertEqual(native_windows(100,200,None,200),[
            ('before_outcome',100,200),('after_failure_10s_observation_only',200,10_000_000_200)])
        self.assertEqual(native_windows(100,None),[])
        self.assertEqual(native_windows(100,200,200,None)[1][0],'after_completion_10s')

    def test_nested_scopes_are_unioned_not_summed(self):
        self.assertEqual(union([(1,10),(2,8),(9,12),(20,21)]),[[1,12],[20,21]])


if __name__=='__main__':unittest.main()
