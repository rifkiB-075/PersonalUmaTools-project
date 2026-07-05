import { useQuery } from '@tanstack/react-query';
import { getRacetracks, getCourses } from '../api/services';
import { useAppStore } from '../store/appStore';
import { SectionLabel, Spinner } from './ui';
import { formatTrackName, formatCourseName } from '../utils/labels';

export default function CourseSelector() {
  const {
    selectedRacetrack,
    selectedCourse,
    setSelectedRacetrack,
    setSelectedCourse,
  } = useAppStore();

  const { data: racetracks = [], isLoading: loadingTracks } = useQuery({
    queryKey: ['racetracks'],
    queryFn: getRacetracks,
    staleTime: 60_000,
  });

  const { data: courses = [], isLoading: loadingCourses } = useQuery({
    queryKey: ['courses', selectedRacetrack?.id],
    queryFn: () => getCourses(selectedRacetrack.id),
    enabled: !!selectedRacetrack,
    staleTime: 60_000,
  });

  return (
    <div>
      <SectionLabel icon="🏟️">Pilih Course</SectionLabel>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Racetrack</label>
        {loadingTracks ? (
          <Spinner />
        ) : (
          <select
            value={selectedRacetrack?.id ?? ''}
            onChange={(e) => {
              const rt = racetracks.find((r) => r.id === Number(e.target.value));
              setSelectedRacetrack(rt || null);
            }}
          >
            <option value="">-- Pilih racetrack --</option>
            {racetracks.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {formatTrackName(rt)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Course</label>
        {loadingCourses && selectedRacetrack ? (
          <Spinner />
        ) : (
          <select
            value={selectedCourse?.id ?? ''}
            disabled={!selectedRacetrack}
            onChange={(e) => {
              const c = courses.find((x) => x.id === Number(e.target.value));
              setSelectedCourse(c || null);
            }}
          >
            <option value="">-- Pilih course --</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {formatCourseName(c)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
