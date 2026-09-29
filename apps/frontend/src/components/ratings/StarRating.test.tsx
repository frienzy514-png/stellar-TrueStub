import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StarRating from './StarRating';

describe('StarRating', () => {
  describe('read-only display mode', () => {
    it.each([0, 1, 2, 3, 4, 5])('renders %i filled stars', (value) => {
      render(<StarRating value={value} max={5} readOnly />);
      const stars = screen.getAllByTestId('star');
      expect(stars).toHaveLength(5);
      const filled = stars.filter((s) => s.getAttribute('data-filled') === 'true');
      expect(filled).toHaveLength(value);
    });

    it('renders a half star for a half-star value', () => {
      render(<StarRating value={2.5} max={5} readOnly />);
      const stars = screen.getAllByTestId('star');
      expect(stars[2]).toHaveAttribute('data-half', 'true');
    });

    it('does not call onChange when clicked in read-only mode', () => {
      const onChange = jest.fn();
      render(<StarRating value={3} max={5} readOnly onChange={onChange} />);
      fireEvent.click(screen.getAllByTestId('star')[0]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('interactive mode', () => {
    it.each([1, 2, 3, 4, 5])('calls onChange with %i when the %i-th star is clicked', (value) => {
      const onChange = jest.fn();
      render(<StarRating value={0} max={5} onChange={onChange} />);
      fireEvent.click(screen.getAllByTestId('star')[value - 1]);
      expect(onChange).toHaveBeenCalledWith(value);
    });

    it('reflects the current value in the rendered stars', () => {
      render(<StarRating value={4} max={5} onChange={jest.fn()} />);
      const stars = screen.getAllByTestId('star');
      const filled = stars.filter((s) => s.getAttribute('data-filled') === 'true');
      expect(filled).toHaveLength(4);
    });
  });
});
