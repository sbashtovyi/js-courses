import {
  compose,
  withStateHandlers,
  withHandlers,
  lifecycle,
  branch,
  renderComponent,
  withProps
} from 'recompose';
import { connect } from 'react-redux';
import { withRouter } from 'react-router';
import * as R from 'ramda';

import { db } from '../../utils';

import AppLoader from '../Loaders/AppLoader';
import Component from './Component';

const mapStateToProps = state => ({
  user: state.user,
  sortBy: state.answerSort,
});

const voteRateProp = R.prop('voteRate');
const createdAtProp = R.prop('createdAt');
const answerIdProp = R.prop('answerId');

const SORT_TYPES = {
  time: R.descend(createdAtProp),
  best: R.descend(voteRateProp),
  worst: R.ascend(voteRateProp),
}

const sortAnswers = sortType => R.sort(SORT_TYPES[sortType]);

const answerRate = R.reduce(((totalRate, vote) =>
  (vote.isPositive ? totalRate + 1 : totalRate - 1)), 0);

const answersWithRate = R.curry((voteRates, answers) => R.map(
  answer => R.merge(answer, voteRates[answer._id]),
  answers,
));

const rateAnswers = (answers, votes) => R.pipe(
  R.groupBy(answerIdProp),
  R.mapObjIndexed(answerVotes => ({ voteRate: answerRate(answerVotes) })),
  answersWithRate(R.__, answers),
)(votes);

const prepareAnswers = ({ answers, votes, sortBy }) =>
  R.pipe(rateAnswers, sortAnswers(sortBy))(answers,votes);

const enhance = compose(
  connect(mapStateToProps),
  withStateHandlers({
    answers: [], users: [], votes: [], isFetching: true,
  }),

  withRouter,

  lifecycle({
    componentWillMount() {
      this.interval = db.pooling(async () => {
        const questionId = this.props.match.params.questionId;

        let answers = await db.answers.find();
        answers = answers.filter(answer => answer.questionId === questionId);

        let votes = await db.votes.find();
        const answerIds = answers.map(a => a._id);
        votes = votes.filter(vote => answerIds.includes(vote.answerId));

        const users = await db.users.find();

        this.setState({
          answers, votes, users, isFetching: false,
        });
      });
    },
    componentWillUnmount() {
      clearInterval(this.interval);
    },
  }),

  branch(
    ({ isFetching }) => isFetching,
    renderComponent(AppLoader),
  ),

  withHandlers({
    onVote: ({ user }) => (answerId, isPositive) => {
      if (user) {
        db.votes.insert({
          answerId,
          isPositive,
          createdAt: new Date(),
          createdById: user._id,
        });
      }
    },
  }),

  withProps(props => ({ answers: prepareAnswers(props) }))
);


export default enhance(Component);
